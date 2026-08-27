import path from "node:path";
import bcrypt from "bcryptjs";
import type { UploadApiResponse } from "cloudinary";
import ejs from "ejs";
import {
	DoctorVerificationStatus,
	Role,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import {
	Actions,
	RedisKeyPrefix,
	redisActions,
} from "../../utils/redisActions";
import type { IRequestUser } from "../auth/auth.interface";
import type {
	IApplyDoctor,
	IApproveDoctorPayload,
	IVerifyDoctorEmailPayload,
} from "./doctor.interface";

const applyAsDoctor = async (
	payload: IApplyDoctor,
	resume: Express.Multer.File | null,
	additionalFiles: Express.Multer.File[],
) => {
	const isDoctorExists = await prisma.doctor.findUnique({
		where: { email: payload.user.email },
	});

	if (isDoctorExists) {
		throw new Error("A doctor is already exists with this email!");
	}

	const uploadResumeAndGetLink = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream({ resource_type: "auto" }, async (error, result) => {
					if (error) {
						return reject(error);
					}

					if (!result) {
						return reject(
							new Error(
								"No result returned from Cloudinary: at applyAsDoctor in doctor.service; uploading resume!",
							),
						);
					}

					resolve(result);
				})
				.end(resume?.buffer);
		},
	);

	const uploadAdditionalFiles = await Promise.all(
		additionalFiles.map((file, indx) => {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				cloudinary.uploader
					.upload_stream({ resource_type: "auto" }, async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(
								new Error(
									`No result returned from Cloudinary: at applyAsDoctor in doctor.service; uploading additional files, file number ${indx + 1}, title: ${file.originalname}!`,
								),
							);
						}

						resolve(result);
					})
					.end(file.buffer);
			});
		}),
	);

	console.log(uploadResumeAndGetLink.original_filename, uploadResumeAndGetLink);

	const hashedPassword = await bcrypt.hash(
		config.seed_password,
		Number(config.bcrypt_salt_rounds),
	);

	const doctorApplication = await prisma.user.create({
		data: {
			...payload.user,
			password: hashedPassword,
			doctor: {
				create: {
					email: payload.user.email,
					...payload.doctor,
					resume: uploadResumeAndGetLink.secure_url,
					resumePublicId: uploadResumeAndGetLink.public_id,
					additionalFiles: uploadAdditionalFiles.map((file) => ({
						url: file.secure_url,
						publicId: file.public_id,
					})),
				},
			},
		},
		include: {
			doctor: true,
		},
		omit: { password: true },
	});

	const expirationSeconds = 60 * 60;

	const OTP = await redisActions({
		keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
		keySuffix: payload.user.email,
		action: Actions.SET_OTP,
		expirationSeconds,
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/doctor-registration-OTP.ejs",
	);

	const userRegistrationOTPVerificationEmail = await ejs.renderFile(
		templatePath,
		{
			otp: OTP,
			name: payload.user.name,
			expiryMinutes: expirationSeconds / 60,
		},
	);

	transporter.sendMail({
		from: config.email_sender,
		to: payload.user.email,
		subject: "Doctor Application - Verify Your Email",
		html: userRegistrationOTPVerificationEmail,
	});

	return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
	const { otp } = payload;
	const email = payload.email.trim().toLowerCase();

	const isDoctorExists = await prisma.user.findFirst({
		where: { email, role: Role.DOCTOR },
	});

	if (!isDoctorExists) {
		throw new Error("Failed to found doctor application! Please apply again.");
	}

	if (isDoctorExists.emailVerified) {
		throw new Error("Email already verified!");
	}

	const OTP = await redisActions({
		keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
		keySuffix: email,
		action: Actions.GET_OTP,
	});

	if (!OTP) {
		throw new Error(
			"OTP expired. Your application window has closed! Please apply again.",
		);
	}

	if (OTP !== otp) {
		throw new Error("Invalid OTP! Please provide the valid one.");
	}

	await redisActions({
		keyPrefix: RedisKeyPrefix.DOCTOR_APPLICATION,
		keySuffix: email,
		action: Actions.DEL_OTP,
	});

	const verifyDoctor = await prisma.user.update({
		where: { id: isDoctorExists.id },
		data: { emailVerified: true },
		omit: { password: true },
		include: { doctor: { omit: { id: true, userId: true, email: true } } },
	});

	return verifyDoctor;
};

const approveDoctor = async (
	payload: IApproveDoctorPayload,
	reviewer: IRequestUser,
) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;

	const isDoctorExists = await prisma.doctor.findUnique({
		where: { id: doctorId },
		include: { user: { omit: { password: true } } },
	});

	if (!isDoctorExists) {
		throw new Error("Doctor application not found!");
	}

	if (isDoctorExists.isDeleted) {
		throw new Error("Doctor application has been deleted!");
	}

	if (!isDoctorExists.user.emailVerified) {
		throw new Error(
			"Docotor hasn't verified their email yet! Application cannot be reviewed!",
		);
	}

	if (isDoctorExists.verificatonStatus !== DoctorVerificationStatus.PENDING) {
		throw new Error(
			`Doctor application has already been ${isDoctorExists.verificatonStatus.toLowerCase()}.`,
		);
	}

	const updateDoctor = await prisma.doctor.update({
		where: { id: doctorId },
		data: {
			verificatonStatus: verificationStatus,
			rejectionReason:
				verificationStatus === DoctorVerificationStatus.REJECTED
					? (rejectionReason ?? null)
					: null,
			reviewAt: new Date(),
			reviewedBy: reviewer.userId,
		},
		include: { user: { select: { name: true } } },
	});

	const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

	const templatePath = path.join(
		process.cwd(),
		`src/app/templates/${isApproved ? "doctor-application-approve-email.ejs" : "doctor-application-reject-email.ejs"}`,
	);

	const html = await ejs.renderFile(templatePath, {
		name: updateDoctor.user.name,
		...(!isApproved && rejectionReason && { rejectionReason }),
	});

	transporter.sendMail({
		from: config.email_sender,
		to: updateDoctor.email,
		subject: isApproved
			? "Your PH Healthcare Doctor Application Has Been Approved"
			: "Update Regarding Your PH Healthcare Doctor Application",
		html,
	});

	return updateDoctor;
};

export const DoctorService = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
};
