import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { Dealer, DealerInventory } from "@xiaomi-car/contracts";

import { useCars, useDealers } from "../api/hooks.js";
import { QueryState } from "../components/query-state.js";
import { OrderDialog } from "../components/order-dialog.js";

interface SelectedUnit {
  dealer: Dealer;
  unit: DealerInventory;
}

export function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const carId = searchParams.get("carId") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const availableOnly = searchParams.get("availableOnly") === "true";
  const [selected, setSelected] = useState<SelectedUnit | undefined>();

  const cars = useCars();
  const dealers = useDealers({ carId, city, availableOnly });

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const dealer of dealers.data ?? []) set.add(dealer.city);
    return [...set];
  }, [dealers.data]);

  function updateParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <main className="inventory">
      <header className="inventory-header">
        <h1>经销商现车</h1>
        <p>选择城市与车型，查看可预订的 0 元下定名额。</p>
      </header>
      <div className="inventory-filters">
        <label>
          车型
          <select
            value={carId ?? ""}
            onChange={(event) => updateParam("carId", event.target.value || undefined)}
          >
            <option value="">全部车型</option>
            {cars.data?.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          城市
          <select
            value={city ?? ""}
            onChange={(event) => updateParam("city", event.target.value || undefined)}
          >
            <option value="">全部城市</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) =>
              updateParam("availableOnly", event.target.checked ? "true" : undefined)
            }
          />
          仅显示有现车
        </label>
      </div>

      <QueryState
        isLoading={dealers.isLoading}
        isError={dealers.isError}
        isEmpty={dealers.data?.length === 0}
        onRetry={() => void dealers.refetch()}
        emptyLabel="未找到匹配的经销商现车"
      >
        <ul className="dealer-list">
          {dealers.data?.map((dealer) => (
            <li key={dealer.id} className="dealer-card">
              <div className="dealer-meta">
                <h2>{dealer.name}</h2>
                <p>
                  {dealer.city} · {dealer.address}
                </p>
                <p className="dealer-hours">{dealer.businessHours}</p>
              </div>
              <ul className="dealer-inventory">
                {dealer.inventory.map((unit) => (
                  <li key={unit.inventoryId}>
                    <div>
                      <strong>{unit.carName}</strong>
                      <span>可预订 {unit.availableQuantity} 台</span>
                    </div>
                    <button
                      type="button"
                      disabled={unit.availableQuantity <= 0}
                      onClick={() => setSelected({ dealer, unit })}
                    >
                      {unit.availableQuantity > 0 ? "0 元下定" : "暂无现车"}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </QueryState>

      {selected ? (
        <OrderDialog
          dealer={selected.dealer}
          unit={selected.unit}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </main>
  );
}
