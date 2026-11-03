import "server-only";
import { formatDate, formatDateTime } from "@/lib/format";
import { config } from "./config";

/** DD/MM/YYYY in the app's time zone (APP_TIMEZONE). */
export const fmtDate = (d: Date) => formatDate(d, config().APP_TIMEZONE);
/** DD/MM/YYYY HH:mm in the app's time zone. */
export const fmtDateTime = (d: Date) => formatDateTime(d, config().APP_TIMEZONE);
