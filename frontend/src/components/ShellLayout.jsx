import { Link, useLocation } from "react-router-dom";

const steps = [
  { path: "/create", title: "1. Create" },
  { path: "/rig-preview", title: "2. Assist Rig" },
  { path: "/interact", title: "3. Interact" },
];

export default function ShellLayout({ title, subtitle, children }) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-tag">Interactive Avatar</p>
          <h1>{title}</h1>
          <p className="app-subtitle">{subtitle}</p>
        </div>
        <nav className="step-nav" aria-label="Workflow steps">
          {steps.map((step) => {
            const active = location.pathname === step.path;
            return (
              <Link key={step.path} to={step.path} className={active ? "step-link active" : "step-link"}>
                {step.title}
              </Link>
            );
          })}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
