import logoMark from "../assets/udo-logo.svg";

function BrandLogo({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-mark" src={logoMark} alt="U.Do logo" />
      <span className="brand-name">U.Do</span>
    </div>
  );
}

export default BrandLogo;
