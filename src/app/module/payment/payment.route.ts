import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import validateQuery from "../../middleware/validateQuery";
import { PaymentController } from "./payment.controller";
import {
  GetAllPaymentsValidationSchema,
  GetMyPaymentsValidationSchema,
} from "./payment.validation";

const router = Router();

router.get(
  "/my-payments",
  auth(Role.PATIENT),
  validateQuery(GetMyPaymentsValidationSchema),
  PaymentController.getMyPayments,
);

router.get(
  "/all-payments",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  validateQuery(GetAllPaymentsValidationSchema),
  PaymentController.getAllPayments,
);

router.get(
  "/:paymentId",
  auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  PaymentController.getAllPayments,
);

export const PaymentRoutes = router;
