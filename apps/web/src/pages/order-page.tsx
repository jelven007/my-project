import { useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import type { Dealer, DealerOffering } from "@xiaomi-car/contracts";

import { useCar, useDealers } from "../api/hooks.js";
import { OrderDialog } from "../components/order-dialog.js";
import { QueryState } from "../components/query-state.js";

interface SelectedOffering {
  dealer: Dealer;
  offering: DealerOffering;
}

export function OrderPage() {
  const [searchParams] = useSearchParams();
  const carId = searchParams.get("carId") ?? undefined;
  const slug = searchParams.get("slug") ?? undefined;
  const car = useCar(slug);
  const dealers = useDealers({
    carId,
    orderableOnly: true,
  });
  const [city, setCity] = useState("");
  const [selected, setSelected] = useState<SelectedOffering | undefined>();

  const cities = useMemo(
    () => [...new Set((dealers.data ?? []).map((dealer) => dealer.city))],
    [dealers.data],
  );
  const visibleDealers = useMemo(
    () =>
      (dealers.data ?? []).filter(
        (dealer) => city === "" || dealer.city === city,
      ),
    [city, dealers.data],
  );

  if (!carId || !slug) return <Navigate replace to="/" />;

  return (
    <main className="order-page">
      <header className="order-header">
        <p>0 元下定</p>
        <h1>{car.data?.name ?? "选择交付门店"}</h1>
        <span>选择方便联系与交付的门店，提交后将由专属顾问确认。</span>
      </header>

      <label className="order-city-filter">
        所在城市
        <select value={city} onChange={(event) => setCity(event.target.value)}>
          <option value="">全部城市</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <QueryState
        isLoading={dealers.isLoading}
        isError={dealers.isError}
        isEmpty={visibleDealers.length === 0}
        onRetry={() => void dealers.refetch()}
        emptyLabel="当前没有可选交付门店，请预约试驾或稍后再试"
      >
        <ul className="delivery-center-list">
          {visibleDealers.map((dealer) => {
            const offering = dealer.availableCars.find(
              (candidate) => candidate.carId === carId && candidate.available,
            );
            if (!offering) return null;
            return (
              <li key={dealer.id}>
                <div>
                  <h2>{dealer.name}</h2>
                  <p>
                    {dealer.city} · {dealer.address}
                  </p>
                  <span>{dealer.businessHours}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected({ dealer, offering })}
                >
                  选择门店
                </button>
              </li>
            );
          })}
        </ul>
      </QueryState>

      {selected ? (
        <OrderDialog
          dealer={selected.dealer}
          offering={selected.offering}
          returnTo={`/order?carId=${carId}&slug=${slug}`}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </main>
  );
}
