/*
  Warnings:

  - You are about to drop the column `verificatonStatus` on the `doctors` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "doctors" DROP COLUMN "verificatonStatus",
ADD COLUMN     "verificationStatus" "DoctorVerificationStatus" NOT NULL DEFAULT 'PENDING';
