import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { MysqlOrderStore } from "../repositories/mysql-order.store.js";
import { OrderService } from "../services/order.service.js";

const service = new OrderService({
  store: new MysqlOrderStore(pool),
  reservationHours: config.ORDER_RESERVATION_HOURS,
});

try {
  let expired = 0;
  do {
    expired = await service.expireDue(100);
    if (expired > 0) process.stdout.write(`Expired ${expired} orders\n`);
  } while (expired === 100);
} finally {
  await pool.end();
}
