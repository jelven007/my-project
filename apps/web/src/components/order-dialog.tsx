import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Dealer, DealerInventory } from "@xiaomi-car/contracts";

import { ApiError } from "../api/client.js";
import { useCreateOrder } from "../api/hooks.js";
import { useAuth } from "../context/auth-context.js";

interface OrderDialogProps {
  dealer: Dealer;
  unit: DealerInventory;
  onClose: () => void;
}

export function OrderDialog({ dealer, unit, onClose }: OrderDialogProps) {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const [contactName, setContactName] = useState(user?.nickname ?? "");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="dialog-backdrop" role="dialog" aria-modal="true">
        <div className="dialog">
          <h2>请先登录</h2>
          <p>0 元下定需要登录账号以便经销商与您联系。</p>
          <div className="dialog-actions">
            <button type="button" onClick={onClose}>
              稍后再说
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => navigate(`/login?returnTo=${encodeURIComponent("/inventory")}`)}
            >
              去登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function submit() {
    setError(undefined);
    try {
      await createOrder.mutateAsync({
        inventoryId: unit.inventoryId,
        contactName: contactName.trim(),
        contactPhone,
      });
      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "下定失败，请稍后重试");
    }
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="0 元下定">
      <div className="dialog">
        {success ? (
          <>
            <h2>下定成功</h2>
            <p>
              我们已为您在 {dealer.name} 预留 {unit.carName}，请在订单中心查看后续进度。
            </p>
            <div className="dialog-actions">
              <button type="button" className="primary" onClick={() => navigate("/account")}>
                查看订单
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>0 元下定 · {unit.carName}</h2>
            <p className="dialog-sub">
              {dealer.name} · {dealer.city}
            </p>
            <label>
              联系人
              <input
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              联系电话
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                inputMode="numeric"
                placeholder="用于经销商联系"
              />
            </label>
            <p className="dialog-note">本次下定金额为 0 元，不涉及任何支付。</p>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button type="button" onClick={onClose} disabled={createOrder.isPending}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void submit()}
                disabled={
                  createOrder.isPending || contactName.trim() === "" || contactPhone === ""
                }
              >
                {createOrder.isPending ? "提交中…" : "确认下定"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
