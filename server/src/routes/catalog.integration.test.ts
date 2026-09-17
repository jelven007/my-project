import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { Car, Dealer } from "@xiaomi-car/contracts";

import { createApp } from "../app.js";
import type { CarsRepository } from "../repositories/cars.repository.js";
import type { ContentRepository } from "../repositories/content.repository.js";
import type { DealersRepository } from "../repositories/dealers.repository.js";
import { createCarsRouter } from "./cars.routes.js";
import { createContentRouter } from "./content.routes.js";
import { createDealersRouter } from "./dealers.routes.js";

const car: Car = {
  id: "1",
  slug: "su7",
  name: "SU7",
  tagline: "高性能生态科技轿车",
  description: "车型资料",
  priceFrom: 215900,
  rangeKm: 700,
  acceleration: 5.28,
  maxPowerPs: 299,
  topSpeed: 210,
  bodyType: "纯电轿车",
  imageUrl: "/images/cars/su7.webp",
  gallery: [],
  highlights: [],
};

const dealer: Dealer = {
  id: "10",
  code: "BJ001",
  name: "北京体验中心",
  province: "北京",
  city: "北京",
  address: "北京市",
  phone: "010-12345678",
  longitude: 116.4,
  latitude: 39.9,
  businessHours: "09:00-18:00",
  inventory: [
    {
      inventoryId: "100",
      carId: "1",
      carName: "SU7",
      carSlug: "su7",
      totalQuantity: 5,
      reservedQuantity: 2,
      availableQuantity: 3,
    },
  ],
};

function setup() {
  const cars: CarsRepository = {
    listPublished: vi.fn().mockResolvedValue([car]),
    findPublishedBySlug: vi.fn().mockImplementation(async (slug) =>
      slug === car.slug ? car : undefined,
    ),
  };
  const content: ContentRepository = {
    findPublished: vi.fn().mockImplementation(async (key) =>
      key === "home.hero"
        ? {
            key,
            type: "hero",
            version: 2,
            payload: { title: "小米汽车" },
            publishedAt: new Date("2026-09-17T00:00:00.000Z"),
          }
        : undefined,
    ),
  };
  const dealers: DealersRepository = {
    listActive: vi.fn().mockResolvedValue([dealer]),
  };
  const app = createApp({
    readinessProbe: async () => undefined,
    carsRouter: createCarsRouter(cars),
    contentRouter: createContentRouter(content),
    dealersRouter: createDealersRouter(dealers),
  });
  return { app, cars, content, dealers };
}

describe("public catalog routes", () => {
  it("returns published content without draft data", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/content/home.hero");

    expect(response.status).toBe(200);
    expect(response.body.payload).toEqual({ title: "小米汽车" });
    expect(response.body).not.toHaveProperty("draftPayload");
    expect(response.headers["cache-control"]).toContain("public");
  });

  it("filters cars and returns 404 for unpublished or missing slugs", async () => {
    const { app, cars } = setup();
    const list = await request(app).get("/api/cars").query({ bodyType: "纯电轿车" });
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([car]);
    expect(cars.listPublished).toHaveBeenCalledWith({ bodyType: "纯电轿车" });

    const missing = await request(app).get("/api/cars/draft-model");
    expect(missing.status).toBe(404);
  });

  it("returns exact available inventory with validated filters", async () => {
    const { app, dealers } = setup();
    const response = await request(app)
      .get("/api/dealers")
      .query({ city: "北京", carId: "1", availableOnly: "true" });

    expect(response.status).toBe(200);
    expect(response.body.items[0].inventory[0].availableQuantity).toBe(3);
    expect(dealers.listActive).toHaveBeenCalledWith({
      city: "北京",
      carId: "1",
      availableOnly: true,
    });
  });
});
