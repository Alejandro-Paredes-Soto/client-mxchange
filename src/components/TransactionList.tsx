"use client";
import { Transaction } from "@/app/services/api";
import React from "react";

const TransactionList: React.FC<{ items: Transaction[] }> = ({ items }) => {
  if (!items || items.length === 0) {
    return <div>No hay transacciones recientes.</div>;
  }

  return (
    <div className="space-y-2">
      {items.map((t) => (
        <div key={t.id} className="flex justify-between p-3 border border-gray-300 rounded-lg">
          <div>
            <div className="font-semibold">{t.type === "buy" ? "Compra" : "Venta"} {Number(t.amountFrom).toFixed(2)} USD</div>
            <div className="text-gray-custom text-sm">{new Date(t.createdAt).toLocaleString()}</div>
            <div className="text-gray-custom text-sm">{t.branch ? t.branch : ''} {t.method ? `• ${t.method}` : ''}</div>
          </div>
          <div className="text-right">
            <div>{t.amountTo} MXN</div>
            <div className="text-gray-custom text-sm">{t.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionList;
