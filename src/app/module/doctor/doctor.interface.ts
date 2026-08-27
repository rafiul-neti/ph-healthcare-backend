import type { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export interface IAdditionalFile {
	url: string;
	publicId: string;
}

export interface ICreateDoctorUser {
	name: string;
	email: string;
	role: "DOCTOR";
	password?: string;
	image?: string;
	imagePublicID?: string;
}

export interface IDoctorUserInfo {
	speicialization: string;
	licenseNumber: string;
	qualifications: string;
	experienceYears?: number;
	bio?: string;
	consultationFee?: number;
	contactNumber?: string;
	resume?: string;
	resumePublicId?: string;
	additionalFiles?: IAdditionalFile[];
}

export interface IApplyDoctor {
	user: ICreateDoctorUser;
	doctor: IDoctorUserInfo;
}

export interface IVerifyDoctorEmailPayload {
	email: string;
	otp: string;
}

export interface IApproveDoctorPayload {
	doctorId: string;
	verificationStatus: DoctorVerificationStatus;
	rejectionReason?: string;
}
