import cron from "node-cron";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "./prisma";

export const deleteUnverifiedDoctors = async () => {
	cron.schedule("*/30 * * * *", async () => {
		try {
			const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

			const deletedDoctors = await prisma.user.deleteMany({
				where: {
					role: Role.DOCTOR,
					emailVerified: false,
					createdAt: { lt: oneHourAgo },
					doctor: {
						verificatonStatus: DoctorVerificationStatus.PENDING,
					},
				},
			});

			if (deletedDoctors.count > 0) {
				console.log(
					`Cron: Deleted ${deletedDoctors.count} unverified doctor's application!`,
				);
			}
		} catch (error) {
			console.log("Cron: failed to delete unverified doctors!", error);
		}

		console.log("Unverified doctor delete cron schedule (every 10 minutes)");
	});
};
