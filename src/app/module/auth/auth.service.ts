import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import path from "path";
import ejs from "ejs";
import type {
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IVerifyPatientEmail,
} from "./auth.interface";
import type { TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import { TForgotPassword, TResetPassword } from "./auth.validation";
import {
  redisActions,
  Actions,
  RedisKeyPrefix,
} from "../../utils/redisActions";
import { transporter } from "../../lib/nodemailer";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientInfo } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  const expirationSeconds = 60 * 5;

  const OTP = await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTER_OTP,
    keySuffix: email,
    action: Actions.SET_OTP,
    expirationSeconds,
  });

  const redisUserDataPayload = {
    name,
    email,
    password: hashedPassword,
    patient: patientInfo,
  };

  await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTRATION_DATA,
    keySuffix: email,
    action: Actions.SET_REGISTRATION_PAYLOAD,
    registrationPayload: redisUserDataPayload,
    expirationSeconds,
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/user-registration-OTP.ejs",
  );
  const userRegistrationOTPVerificationEmail = await ejs.renderFile(
    templatePath,
    {
      otp: OTP,
      name,
      expiryMinutes: expirationSeconds / 60,
    },
  );

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "PH-Healthcare - Verify Your Email",
    html: userRegistrationOTPVerificationEmail,
  });

  return null;
};

const verifyPatientEmail = async (payload: IVerifyPatientEmail) => {
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({ where: { email } });

  if (isUserExists?.emailVerified) {
    throw new Error("Email already verified!");
  }

  const OTP = await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTER_OTP,
    keySuffix: email,
    action: Actions.GET_OTP,
  });

  if (OTP !== payload.otp) {
    throw new Error("OTP does not match! Please provide a valid OTP.");
  }

  await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTER_OTP,
    keySuffix: email,
    action: Actions.DEL_OTP,
  });

  const getPatientDataFromRedis = await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTRATION_DATA,
    keySuffix: email,
    action: Actions.GET_OTP,
  });

  if (!getPatientDataFromRedis) {
    throw new Error("OTP has expired. Please try again after some times.");
  }

  const patientData: IRegisterPatientPayload = JSON.parse(
    getPatientDataFromRedis as string,
  );

  const createdUser = await prisma.user.upsert({
    where: { email },
    update: { emailVerified: true },
    create: {
      name: patientData.name,
      email: patientData.email,
      password: patientData.password,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      ...(patientData?.patient &&
        patientData?.patient?.contactNumber && {
          patient: {
            create: { contactNumber: patientData.patient.contactNumber },
          },
        }),
    },
    omit: { password: true },
    include: { patient: true },
  });

  await redisActions({
    keyPrefix: RedisKeyPrefix.PATIENT_REGISTRATION_DATA,
    keySuffix: email,
    action: Actions.DEL_OTP,
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/patient-welcome-email.ejs",
  );
  const userRegistrationOTPVerificationEmail = await ejs.renderFile(
    templatePath,
    {
      name: patientData.name,
    },
  );

  await transporter.sendMail({
    from: config.email_sender,
    to: createdUser.email,
    subject: `Welcome to PH Healthcare, ${createdUser.name}!`,
    html: userRegistrationOTPVerificationEmail,
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "It looks like you registered using Google. Please 'Sign in with Google'.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | undefined | null = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("google id token verification failed", error);
    throw new Error("Invalid or expired google id tolen.");
  }

  if (!googleIdTokenPayload)
    throw new Error("Invalid or expired google id tolen.");

  if (!googleIdTokenPayload.email) {
    throw new Error("Google account email not found! Please try again.");
  }

  const isPatientExists = await prisma.user.findFirst({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = isPatientExists;

  if (!user) {
    const isPatientExistsWithCredentials = await prisma.user.findFirst({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (isPatientExistsWithCredentials) {
      if (!isPatientExistsWithCredentials.emailVerified) {
        throw new Error("Email not verified!");
      }

      if (isPatientExistsWithCredentials.status === UserStatus.BLOCKED) {
        throw new Error(
          "Your account has been blocked. Please contact support.",
        );
      }

      if (
        isPatientExistsWithCredentials.status === UserStatus.DELETED ||
        isPatientExistsWithCredentials.isDeleted
      ) {
        throw new Error(
          "Your account has been deleted. Please contact support.",
        );
      }

      user = await prisma.user.update({
        where: { id: isPatientExistsWithCredentials.id },
        data: { googleId: googleIdTokenPayload.sub },
      });
    } else {
      // user register with google
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name ?? "name",
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          authProvider: AuthProvider.GOOGLE,
          emailVerified: true,
        },
      });

      const templatePath = path.join(
        process.cwd(),
        "src/app/templates/patient-welcome-email.ejs",
      );
      const userRegistrationOTPVerificationEmail = await ejs.renderFile(
        templatePath,
        {
          name: user.name,
        },
      );

      await transporter.sendMail({
        from: config.email_sender,
        to: user.email,
        subject: `Welcome to PH Healthcare, ${user.name}!`,
        html: userRegistrationOTPVerificationEmail,
      });
    }
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("Your account has been blocked. Please contact support.");
  }

  if (user.status === UserStatus.DELETED || user.isDeleted) {
    throw new Error("Your account has been deleted. Please contact support.");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: TForgotPassword) => {
  const { email } = payload;

  const isUserExists = await prisma.user.findUnique({ where: { email } });
  if (!isUserExists) {
    throw new Error(
      "No account found. Check your mobile number or email address and try again.",
    );
  }

  if (isUserExists.status === UserStatus.BLOCKED) {
    throw new Error("Your account has been blocked. Please contact support.");
  }

  if (isUserExists.status === UserStatus.DELETED) {
    throw new Error("Your account is deleted!");
  }

  if (!isUserExists.emailVerified) {
    throw new Error("Email unverified! Please verify your email first.");
  }

  if (
    isUserExists.authProvider !== "CREDENTIAL" ||
    isUserExists.password === null
  ) {
    throw new Error("Invalid request: forgot password!");
  }

  const setOTPToRedis = await redisActions({
    keyPrefix: "forgot-password-OTP",
    keySuffix: email,
    action: Actions.SET_OTP,
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/forgot-password-OTP-email.ejs",
  );
  const forgotPasswordEmailHTML = await ejs.renderFile(templatePath, {
    otp: setOTPToRedis,
    name: isUserExists.name,
    expiryMinutes: 2,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "PH-Healthcare - Forgot Password OTP",
    html: forgotPasswordEmailHTML,
  });

  return setOTPToRedis;
};

const resetPassword = async (payload: TResetPassword) => {
  const { email, otpFor, otp, newPassword } = payload;

  const isUserExists = await prisma.user.findUnique({ where: { email } });
  if (!isUserExists) {
    throw new Error(
      "No account found. Check your mobile number or email address and try again.",
    );
  }

  if (isUserExists.status === UserStatus.BLOCKED) {
    throw new Error("Your account has been blocked. Please contact support.");
  }

  if (isUserExists.status === UserStatus.DELETED) {
    throw new Error("Your account is deleted!");
  }

  if (!isUserExists.emailVerified) {
    throw new Error("Email unverified! Please verify your email first.");
  }

  if (
    isUserExists.authProvider !== "CREDENTIAL" ||
    isUserExists.password === null
  ) {
    throw new Error("Invalid request: forgot password!");
  }

  const OTP = await redisActions({
    keyPrefix: otpFor,
    keySuffix: email,
    action: Actions.GET_OTP,
  });

  if (otp !== OTP) {
    throw new Error("Invalid OTP");
  }

  const hashedNewPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  await prisma.user.update({
    where: { email: isUserExists.email },
    data: { password: hashedNewPassword },
  });

  await redisActions({
    keyPrefix: otpFor,
    keySuffix: email,
    action: Actions.DEL_OTP,
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/reset-password-success.ejs",
  );
  const resetPasswordEmailHTML = await ejs.renderFile(templatePath, {
    name: isUserExists.name,
  });

  transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "PH-Healthcare - Forgot Password OTP",
    html: resetPasswordEmailHTML,
  });

  return OTP;
};

export const AuthService = {
  registerPatient,
  verifyPatientEmail,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
