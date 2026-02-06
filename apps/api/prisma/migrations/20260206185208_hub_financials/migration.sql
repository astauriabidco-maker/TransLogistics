-- AlterTable
ALTER TABLE "hub_performance_snapshots" ADD COLUMN     "costXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isMarginComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marginXof" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "revenueXof" DECIMAL(15,2) NOT NULL DEFAULT 0;
