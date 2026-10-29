-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('STRUCTURING', 'ACTIVE', 'FUNDED');

-- AlterTable
ALTER TABLE "investors" ADD COLUMN     "tenant_nda_accepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenant_nda_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "status" "ProjectStatus" NOT NULL DEFAULT 'STRUCTURING';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accepted_rwaxi_liability" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rwaxi_acceptance_date" TIMESTAMP(3);
