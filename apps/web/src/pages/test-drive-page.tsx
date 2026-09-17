import { useMemo, useState } from "react";

import { ApiError } from "../api/client.js";
import { useCars, useCreateTestDrive, useDealers } from "../api/hooks.js";
import { useAuth } from "../context/auth-context.js";

function tomorrowIso(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function TestDrivePage() {
  const { user } = useAuth();
  const cars = useCars();
  const [carId, setCarId] = useState("");
  const dealers = useDealers({
    carId: carId || undefined,
    enabled: carId !== "",
  });
  const [dealerId, setDealerId] = useState("");
  const [contactName, setContactName] = useState(user?.nickname ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState(tomorrowIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const createTestDrive = useCreateTestDrive();

  const dealerOptions = useMemo(
    () =>
      (dealers.data ?? []).filter((dealer) =>
        dealer.availableCars.some((offering) => offering.carId === carId),
      ),
    [carId, dealers.data],
  );

  async function submit() {
    setError(undefined);
    try {
      await createTestDrive.mutateAsync({
        carId,
        dealerId,
        contactName: contactName.trim(),
        contactPhone,
        preferredDate,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "预约失败，请稍后重试");
    }
  }

  if (submitted) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>预约成功</h1>
          <p>顾问会尽快与您联系确认试驾时间，可在个人中心查看进度。</p>
        </div>
      </main>
    );
  }

  return (
    <main className="test-drive">
      <header>
        <h1>预约试驾</h1>
        <p>选择心仪车型与就近门店，我们将安排专属试驾。</p>
      </header>
      <form
        className="test-drive-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label>
          车型
          <select
            value={carId}
            onChange={(event) => {
              setCarId(event.target.value);
              setDealerId("");
            }}
            required
          >
            <option value="">请选择车型</option>
            {cars.data?.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          门店
          <select
            value={dealerId}
            onChange={(event) => setDealerId(event.target.value)}
            required
            disabled={carId === ""}
          >
            <option value="">请选择门店</option>
            {dealerOptions.map((dealer) => (
              <option key={dealer.id} value={dealer.id}>
                {dealer.city} · {dealer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          联系人
          <input value={contactName} onChange={(event) => setContactName(event.target.value)} required maxLength={80} />
        </label>
        <label>
          联系电话
          <input
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            inputMode="numeric"
            required
          />
        </label>
        <label>
          期望日期
          <input
            type="date"
            value={preferredDate}
            min={tomorrowIso()}
            onChange={(event) => setPreferredDate(event.target.value)}
            required
          />
        </label>
        <label className="full">
          备注
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" className="primary-action block" disabled={createTestDrive.isPending}>
          {createTestDrive.isPending ? "提交中…" : "提交预约"}
        </button>
      </form>
    </main>
  );
}
