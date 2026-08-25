import z from "zod";
import { RedisKeyPrefix } from "../../utils/redisActions";

const PatientRegistrationZodSchema = z.object({
  name: z
    .string("Not A String!!!!!")
    .min(3, "Name must atleast 3 characters long!!!")
    .max(10),
  email: z.email("Not email!!"),
  password: z
    .string()
    .min(8, "Password Must Minimum 8 Characters Long.")
    .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
    .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

    .regex(/[0-9]/, "Password must contain atleast 1 Number")
    .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
  patient: z
    .object({
      contactNumber: z.string().optional(),
    })
    .optional(),
});

const VerifyEmailShema = z.object({
  email: z.email(),
  otp: z.string().length(6, "OTP must be a 6-digit number!"),
});

const LoginZodSchema = z.object({
  email: z.email("Not email!!"),
  password: z
    .string()
    .min(8, "Password Must Minimum 8 Characters Long.")
    .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
    .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

    .regex(/[0-9]/, "Password must contain atleast 1 Number")
    .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
});

const ForgotPasswordSchema = z.object({
  email: z.email(),
});

const ResetPasswordSchema = z.object({
  email: z.email(),
  newPassword: z
    .string()
    .min(8, "Password Must Minimum 8 Characters Long.")
    .regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
    .regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

    .regex(/[0-9]/, "Password must contain atleast 1 Number")
    .regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
  otp: z.string().length(6, "OTP must be a 6-digit number!"),
  otpFor: z.enum(RedisKeyPrefix, {
    error: `Key prefix (otpFor) must be one of ${JSON.stringify(RedisKeyPrefix)}`,
  }),
});

export const AuthValidationSchemas = {
  PatientRegistrationZodSchema,
  LoginZodSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema, VerifyEmailShema
};

// ! infering types by schemas above
export type TForgotPassword = z.infer<typeof ForgotPasswordSchema>;
export type TResetPassword = z.infer<typeof ResetPasswordSchema>;
