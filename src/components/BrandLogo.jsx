import logoMark from "../assets/udo-logo.svg";

function BrandLogo({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-mark" src={logoMark} alt="U.Do logo" />
    </div>
  );
}

export default BrandLogo;
