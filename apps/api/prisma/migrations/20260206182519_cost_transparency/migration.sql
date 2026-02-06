-- AlterTable
ALTER TABLE "route_performance_snapshots" ADD COLUMN     "costAssumptions" JSONB,
ADD COLUMN     "isMarginComplete" BOOLEAN NOT NULL DEFAULT false;
