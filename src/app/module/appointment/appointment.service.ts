import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) {
    throw new Error(
      "Failed to get bkash id_token: getting bkashIdToken from bookAppointment in appointment service.",
    );
  }

  const bkashCreatePaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/create`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        agreementId: "TokenizedMerchant02appointmentId",
        mode: "0011",
        payerReference: "irafiul210", //user email or phone num
        callbackURL: `${config.bakend_app_url}/api/v1/appointment/book-appointment/payment/callback`,
        // merchantAssociationInfo: "MI09876TG",
        amount: "999",
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: "inv012345678",
      }),
    },
  );

  const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();
  return bkashCreatePaymentResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  const paymentId = query.paymentID;
  if (!paymentId) {
    throw new Error("Payment ID is missing!");
  }

  const status = query.status;
  if (!status) {
    throw new Error("Payment status is missing!");
  }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("BKash Access Token not found!");
  }

  const executedPaymentResponse = await fetch(
    `${config.bkash_sandbox_url}/tokenized/checkout/execute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        paymentID: paymentId,
      }),
    },
  );

  const executedPaymentResult = await executedPaymentResponse.json();

  if(status === "success") {
    return {
      executedPaymentResult, redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=success`
    }
  }

  if (status === "failure") {
    return {
      executedPaymentResult,
      redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
    };
  }

  if (status === "cancel") {
    return {
      executedPaymentResult,
      redirectURL: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
    };
  }

 return {
   executedPaymentResult,
   redirectURL: `${config.frontend_url}/dashboard/my-appointments`,
 };
};

export const AppointmentService = { bookAppointment, bookAppointmentCallback };
