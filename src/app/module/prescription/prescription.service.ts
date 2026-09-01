import { UploadApiResponse } from "cloudinary";
import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary } from "../../lib/cloudinary";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { IRequestUser } from "../auth/auth.interface";
import type { ICreatePrescriptionPayload } from "./prescription.interface";

async function createPrescription(
  payload: ICreatePrescriptionPayload,
  user: IRequestUser,
) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor not found!");
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: payload.appointmentId, doctorId: doctor.id },
    include: { patient: { select: { user: { select: { email: true } } } } },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment not found!");
  }

  if (appointment.status !== AppointmentStatus.COMPLETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Prescriptions can only be written for completed appointments!",
    );
  }

  if (appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A prescriptions is already exists for this appointment!",
    );
  }

  const pdfDocument = new PDFDocument({ margin: 50 });
  const pdfChunks: Buffer[] = [];

  pdfDocument.on("data", (chunk: Buffer) => {
    pdfChunks.push(chunk);
  });

  const pdfReadyPromise = new Promise<Buffer>((resolve) => {
    pdfDocument.on("end", () => {
      resolve(Buffer.concat(pdfChunks));
    });
  });

  // pdf contents

  pdfDocument.end();

  const pdfBuffer = await pdfReadyPromise;

  // upload the pdf to get a link and a public_id
  const prescriptionUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            format: "pdf",
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(
                new AppError(
                  httpStatus.INTERNAL_SERVER_ERROR,
                  "No Result returned fron Cloudinary!",
                ),
              );
            }

            resolve(result);
          },
        )
        .end(pdfBuffer);
    },
  );

  // update the appointment and populate thw prescription link and public _id
  const updatedAppointment = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      prescriptionUrl: prescriptionUploadResult.secure_url,
      prescriptionPublicId: prescriptionUploadResult.public_id,
    },
  });

  // send the prescription pdf to the patoent through email
  await transporter.sendMail({
    from: config.email_sender,
    to: appointment.patient.user.email,
    subject: "Your Prescription - PH Healthcare System",
    text: "Please find your prescription attached.",
    attachments: [
      {
        filename: "prescription.pdf",
        content: pdfBuffer,
      },
    ],
  });

  return updatedAppointment;
}

async function getsinglePrescription(
  appointmentId: string,
  user: IRequestUser,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { user: { select: { email: true } }, userId: true } },
      doctor: { select: { userId: true } },
    },
  });

  if (!appointment) {
    throw new AppError(httpStatus.NOT_FOUND, "Appointment not found!");
  }

  if (
    (user.role === Role.DOCTOR && appointment.doctor.userId !== user.userId) ||
    (user.role === Role.PATIENT && appointment.patient.userId !== user.userId)
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to view this appointment!",
    );
  }

  if (!appointment.prescriptionUrl) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "No Prescription has been written yet!",
    );
  }

  return {
    appointment,
    prescription: appointment.prescriptionUrl,
  };
}

export const PrescriptionService = {
  createPrescription,
  getsinglePrescription,
};
