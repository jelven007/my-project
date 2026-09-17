import { ArrowRight } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useCar } from "../api/hooks.js";
import { QueryState } from "../components/query-state.js";
import { formatPrice } from "../lib/format.js";

export function CarDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const car = useCar(slug);

  return (
    <main className="car-detail">
      <QueryState
        isLoading={car.isLoading}
        isError={car.isError}
        onRetry={() => void car.refetch()}
        errorLabel="车型信息加载失败"
      >
        {car.data ? (
          <>
            <section className="car-hero">
              <img
                src={car.data.imageUrl}
                alt={car.data.name}
                fetchPriority="high"
                decoding="async"
              />
              <div>
                <p>{car.data.tagline}</p>
                <h1>{car.data.name}</h1>
                <strong>{formatPrice(car.data.priceFrom)} 起</strong>
                <div className="car-actions">
                  <Link className="primary-action" to={`/inventory?carId=${car.data.id}`}>
                    查看现车 <ArrowRight size={18} />
                  </Link>
                  <Link className="secondary-action" to="/test-drive">
                    预约试驾
                  </Link>
                </div>
              </div>
            </section>
            <section className="car-specs">
              <dl>
                <div>
                  <dt>CLTC 续航</dt>
                  <dd>{car.data.rangeKm} km</dd>
                </div>
                <div>
                  <dt>零百加速</dt>
                  <dd>{car.data.acceleration}s</dd>
                </div>
                <div>
                  <dt>最大马力</dt>
                  <dd>{car.data.maxPowerPs} PS</dd>
                </div>
                <div>
                  <dt>最高车速</dt>
                  <dd>{car.data.topSpeed} km/h</dd>
                </div>
              </dl>
              <p className="car-description">{car.data.description}</p>
            </section>
          </>
        ) : null}
      </QueryState>
    </main>
  );
}
