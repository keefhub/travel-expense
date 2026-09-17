-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budget" DOUBLE PRECISION,
    "shareToken" TEXT NOT NULL,
    "creatorToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_shareToken_key" ON "Trip"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_creatorToken_key" ON "Trip"("creatorToken");
