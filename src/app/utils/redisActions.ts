import crypto from "crypto";
import { redisClient } from "../lib/redis";
import type { IRegisterPatientPayload } from "../module/auth/auth.interface";

export const Actions = {
  SET_OTP: "SET_OTP",
  GET_OTP: "GET_OTP",
  DEL_OTP: "DEL_OTP",
  SET_REGISTRATION_PAYLOAD: "SET_REGISTRATION_PAYLOAD",
  TIME_TO_LEAVE: "TIME_TO_LEAVE",
} as const;

export const RedisKeyPrefix = {
  PATIENT_REGISTER_OTP: "patient-register-OTP",
  PATIENT_REGISTRATION_DATA: "patient-registration-data",
  FORGOT_PASSWORD_OTP: "forgot-password-OTP",
  RESET_PASSWORD_OTP: "reset-password-OTP",
  BKASH: "bkash",
} as const;

type OTPAction = (typeof Actions)[keyof typeof Actions];
type KeyPrefix = (typeof RedisKeyPrefix)[keyof typeof RedisKeyPrefix];

export const redisActions = async (otpActionsPayload: {
  keyPrefix: KeyPrefix;
  keySuffix: string;
  action: OTPAction;
  registrationPayload?: IRegisterPatientPayload;
  expirationSeconds?: number;
  oneTimePass?: string;
}) => {
  const {
    keyPrefix,
    keySuffix,
    action,
    registrationPayload,
    expirationSeconds,
  } = otpActionsPayload;
  const key = `${keyPrefix}:${keySuffix}`;
  if (action === Actions.SET_OTP) {
    const OTP = otpActionsPayload.oneTimePass
      ? otpActionsPayload.oneTimePass
      : crypto.randomInt(100000, 1000000).toString();

    await redisClient.set(key, OTP, {
      expiration: {
        type: "EX",
        value: expirationSeconds ?? 2 * 60,
      },
    });

    return OTP;
  }

  if (action === Actions.GET_OTP) {
    const OTP = await redisClient.get(key);
    return OTP;
  }

  if (action === Actions.DEL_OTP) {
    const OTP = await redisClient.del([key]);
    return OTP;
  }

  if (action === Actions.SET_REGISTRATION_PAYLOAD && registrationPayload) {
    await redisClient.set(key, JSON.stringify(registrationPayload), {
      expiration: {
        type: "EX",
        value: expirationSeconds ?? 2 * 60,
      },
    });
  }

  if (action === Actions.TIME_TO_LEAVE) {
    const TTL = await redisClient.ttl(key);
    return TTL;
  }
};
