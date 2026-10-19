import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialMetrics, financialCsv } from "../src/lib/financialReport.ts";

test("financial metrics exclude cancelled orders and keep profit unavailable without cost data", () => {
  const result = calculateFinancialMetrics([
    { status: "Delivered", subtotal: 100, total: 115, shipping_fee: 15, discount_amount: 10 },
    { status: "Cancelled", subtotal: 500, total: 500, shipping_fee: 0 },
  ]);
  assert.equal(result.orderCount, 1);
  assert.equal(result.grossSales, 110);
  assert.equal(result.netSales, 115);
  assert.equal(result.shippingRevenue, 15);
  assert.equal(result.profit, null);
});

test("financial CSV escapes spreadsheet formulas", () => {
  const csv = financialCsv({ grossSales: 0, discounts: 0, refunds: 0, netSales: 0, orderCount: 0, averageOrderValue: 0, shippingRevenue: 0, cogs: null, profit: null, margin: null }, [{ date: "=1+1", orders: 1, netSales: 2 }]);
  assert.match(csv, /'=1\+1/);
});
