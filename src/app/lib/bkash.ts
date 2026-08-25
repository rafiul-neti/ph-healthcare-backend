import config from "../config";
import { Actions, redisActions, RedisKeyPrefix } from "../utils/redisActions";

export const getBkashIdToken = async () => {
  try {
    const suffixForBkashIdToken = "idToken";
    const suffixForBkashRefreshToken = "refreshToken";

    let bkashIdToken = await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashIdToken,
      action: Actions.GET_OTP,
    });

    const bkashIdTokenTTL = await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashIdToken,
      action: Actions.TIME_TO_LEAVE,
    });

    const bkashRefreshToken = await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashRefreshToken,
      action: Actions.GET_OTP,
    });

    const bkashRefreshTokenTTL = await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashRefreshToken,
      action: Actions.TIME_TO_LEAVE,
    });

    /*console.log({
      bkashIdToken,
      bkashIdTokenTTL,
      bkashRefreshToken,
      bkashRefreshTokenTTL,
    }); */

    // bkash id_token's time to leave from redis is less than or equal 600 seconds or bkash id_token is expired,
    // bkash refresh_token exists in redis,
    // and refresh_token's time to leave from redis is more than 600 seconds
    if (
      ((bkashIdTokenTTL as number) <= 600 || !bkashIdToken) &&
      bkashRefreshToken &&
      (bkashRefreshTokenTTL as number) > 600
    ) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_sandbox_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );

      if (!refreshTokenResponse.ok) {
        throw new Error("Failed to get a new id_toke: using refresh_token!");
      }

      const refreshTokenResult = await refreshTokenResponse.json();

      bkashIdToken = refreshTokenResult.id_token;

      await redisActions({
        otpFor: RedisKeyPrefix.BKASH,
        userEmail: suffixForBkashIdToken,
        action: Actions.SET_OTP,
        oneTimePass: bkashIdToken as string,
        expirationSeconds: 60 * 60,
      });

      return bkashIdToken;
    }

    if (bkashIdToken) {
      return bkashIdToken;
    }

    const response = await fetch(
      `${config.bkash_sandbox_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("bKash Access Token Grant Failed!");
    }

    const result = await response.json();
    bkashIdToken = result.id_token;

    //   set bkash id_token to Redis
    await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashIdToken,
      action: Actions.SET_OTP,
      oneTimePass: result.id_token,
      expirationSeconds: 60 * 60, // 1 hour
    });

    // set bkash refresh_token yo Redis
    await redisActions({
      otpFor: RedisKeyPrefix.BKASH,
      userEmail: suffixForBkashRefreshToken,
      action: Actions.SET_OTP,
      oneTimePass: result.refresh_token,
      expirationSeconds: 60 * 60 * 24 * 28, // 28 days
    });

    return bkashIdToken;
  } catch (error: any) {
    throw new Error(
      `${error.message}   -------->>>> Error from bkash getIdTokenMethod.`,
    );
  }
};
