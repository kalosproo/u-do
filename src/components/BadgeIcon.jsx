import { FiActivity, FiAward, FiCheck, FiCheckCircle, FiClock, FiLayers, FiStar, FiSun, FiTarget, FiTrendingUp, FiZap } from "react-icons/fi";

const ICONS = {
  zap: FiZap,
  clock: FiClock,
  award: FiAward,
  star: FiStar,
  trend: FiTrendingUp,
  activity: FiActivity,
  sun: FiSun,
  target: FiTarget,
  check: FiCheck,
  checkCircle: FiCheckCircle,
  layers: FiLayers,
};

function BadgeIcon({ name }) {
  const Icon = ICONS[name] || FiAward;
  return <Icon aria-hidden="true" />;
}

export default BadgeIcon;
