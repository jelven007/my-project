import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useCars } from "../api/hooks.js";
import { formatPrice } from "../lib/format.js";
import { QueryState } from "../components/query-state.js";

const heroImage = "/images/home-hero.jpg";

export function HomePage() {
  const cars = useCars();

  return (
    <main>
      <section className="hero">
        <img src={heroImage} alt="小米汽车纯电轿车" fetchPriority="high" />
        <div className="hero-copy">
          <p>人车家全生态</p>
          <h1>小米汽车</h1>
          <span>先进移动智能空间，为驾驶注入更多可能。</span>
          <div className="hero-actions">
            <Link className="primary-action" to="/inventory">
              查看现车 <ArrowRight size={18} />
            </Link>
            <Link className="secondary-action" to="/test-drive">
              预约试驾
            </Link>
          </div>
        </div>
      </section>
      <section className="models" aria-labelledby="models-title">
        <div className="section-heading">
          <div>
            <p>探索车型</p>
            <h2 id="models-title">为每一种热爱而来</h2>
          </div>
          <Link to="/inventory">
            全部库存 <ArrowRight size={17} />
          </Link>
        </div>
        <QueryState
          isLoading={cars.isLoading}
          isError={cars.isError}
          isEmpty={cars.data?.length === 0}
          onRetry={() => void cars.refetch()}
          emptyLabel="暂无在售车型"
        >
          <div className="model-grid">
            {cars.data?.map((car) => (
              <article className="model" key={car.id}>
                <img
                  className="model-image"
                  src={car.imageUrl}
                  alt={car.name}
                  loading="lazy"
                  decoding="async"
                />
                <div className="model-copy">
                  <p>{car.tagline}</p>
                  <h3>{car.name}</h3>
                  <span>{formatPrice(car.priceFrom)} 起</span>
                  <Link to={`/cars/${car.slug}`}>
                    了解详情 <ArrowRight size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </QueryState>
      </section>
    </main>
  );
}
