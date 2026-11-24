import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { db, type DbRow } from "@/lib/db";

export interface LeadInsert {
  sessionId: number;
  idempotencyKey: string;
  reference: string;
  name: string;
  phone: string;
  pickup: string;
  dropoff: string;
  travelDate: string;
  returnDate: string | null;
  vehicleType: string;
  passengerCount: number;
  tripType: string;
  requirements: string | null;
  consentTextVersion: string;
}

export interface LeadReference extends DbRow {
  lead_reference: string;
}

export async function findLeadByIdempotency(sessionId: number, key: string) {
  const [rows] = await db.execute<LeadReference[]>(
    "SELECT lead_reference FROM chatbot_leads WHERE session_id = ? AND idempotency_key = ? LIMIT 1",
    [sessionId, key],
  );
  return rows[0]?.lead_reference ?? null;
}

export async function createLead(input: LeadInsert, connection?: PoolConnection) {
  const executor = connection ?? db;
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT INTO chatbot_leads
      (lead_reference, session_id, idempotency_key, name, phone, pickup, dropoff,
       travel_date, return_date, vehicle_type, passenger_count, trip_type,
       requirements, consent, consent_text_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
    [
      input.reference,
      input.sessionId,
      input.idempotencyKey,
      input.name,
      input.phone,
      input.pickup,
      input.dropoff,
      input.travelDate,
      input.returnDate,
      input.vehicleType,
      input.passengerCount,
      input.tripType,
      input.requirements,
      input.consentTextVersion,
    ],
  );
  return result.insertId;
}
