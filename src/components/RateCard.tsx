"use client";
import { Rates } from "@/app/services/api";
import React from "react";

const Skeleton = ({ className }: { className?: string }) => (
  <div className={`bg-gray-300 rounded-md animate-pulse ${className}`} />
);

const RateCard: React.FC<{ rates: Rates | null }> = ({ rates }) => {
  const isLoading = !rates;

  return (
    <div className="p-4 sm:p-6 border border-gray-300 rounded-2xl transition-all">
      <h3 className="mb-4 font-semibold text-primary text-lg sm:text-xl sm:text-left text-center">
        Tasa USD / MXN
      </h3>

      <div className="flex sm:flex-row flex-col sm:justify-start sm:items-center gap-6 sm:gap-20">
        <div className="sm:text-left text-center">
          <div className="text-gray-custom text-lg sm:text-2xl">Compra</div>
          {isLoading ? (
            <Skeleton className="mx-auto sm:mx-0 w-32 h-10 sm:h-12" />
          ) : (
            <div className="font-bold text-primary text-4xl sm:text-5xl">
              {rates.usd.buy} MXN
            </div>
          )}
        </div>

        <div className="sm:text-left text-center">
          <div className="text-gray-custom text-lg sm:text-2xl">Venta</div>
          {isLoading ? (
            <Skeleton className="mx-auto sm:mx-0 w-32 h-10 sm:h-12" />
          ) : (
            <div className="font-bold text-primary text-4xl sm:text-5xl">
              {rates.usd.sell} MXN
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-gray-custom text-xs sm:text-sm sm:text-left text-center">
        {isLoading ? (
          <Skeleton className="mx-auto sm:mx-0 w-40 h-3" />
        ) : (
          <>
            Última actualización:{" "}
            {new Date(rates.lastUpdated).toLocaleTimeString()}
          </>
        )}
      </div>
    </div>
  );
};

export default RateCard;
