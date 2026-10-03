import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Props for the main button
interface WetPaintButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  variant?: "white-blue" | "indigo";
}

// The main component that renders the button and its drips
export const WetPaintButton: React.FC<WetPaintButtonProps> = ({
  children,
  className = "",
  variant = "white-blue",
  ...props
}) => {
  const isWhite = variant === "white-blue";

  return (
    <button
      className={cn(
        "group relative rounded-full px-8 py-3.5 font-bold uppercase tracking-wider transition-all duration-200",
        isWhite
          ? "bg-white text-[#0284c7] shadow-[0_8px_24px_rgba(2,132,199,0.22)] border border-[#bae6fd] hover:bg-slate-50 hover:text-[#0369a1] active:translate-y-0.5"
          : "bg-indigo-500 text-white hover:bg-indigo-600",
        className
      )}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      <Drip left="10%" height={24} delay={0.5} color={isWhite ? "bg-white" : "bg-indigo-500"} hoverColor={isWhite ? "group-hover:bg-slate-50" : "group-hover:bg-indigo-600"} svgFill={isWhite ? "#ffffff" : "#6366f1"} />
      <Drip left="30%" height={20} delay={3} color={isWhite ? "bg-white" : "bg-indigo-500"} hoverColor={isWhite ? "group-hover:bg-slate-50" : "group-hover:bg-indigo-600"} svgFill={isWhite ? "#ffffff" : "#6366f1"} />
      <Drip left="57%" height={10} delay={4.25} color={isWhite ? "bg-white" : "bg-indigo-500"} hoverColor={isWhite ? "group-hover:bg-slate-50" : "group-hover:bg-indigo-600"} svgFill={isWhite ? "#ffffff" : "#6366f1"} />
      <Drip left="85%" height={16} delay={1.5} color={isWhite ? "bg-white" : "bg-indigo-500"} hoverColor={isWhite ? "group-hover:bg-slate-50" : "group-hover:bg-indigo-600"} svgFill={isWhite ? "#ffffff" : "#6366f1"} />
    </button>
  );
};

// Props for the Drip component
type DripProps = {
  left: string;
  height: number;
  delay: number;
  color?: string;
  hoverColor?: string;
  svgFill?: string;
};

// The Drip component creates the animated dripping effect
const Drip: React.FC<DripProps> = ({
  left,
  height,
  delay,
  color = "bg-white",
  hoverColor = "group-hover:bg-slate-50",
  svgFill = "#ffffff",
}) => {
  return (
    <motion.div
      className="absolute top-[99%] origin-top pointer-events-none"
      style={{ left }}
      initial={{ scaleY: 0.75 }}
      animate={{ scaleY: [0.75, 1, 0.75] }}
      transition={{
        duration: 2,
        times: [0, 0.25, 1],
        delay,
        ease: "easeIn",
        repeat: Infinity,
        repeatDelay: 2,
      }}
    >
      {/* The main body of the drip */}
      <div
        style={{ height }}
        className={cn("w-2 rounded-b-full transition-colors drop-shadow-sm", color, hoverColor)}
      />

      {/* SVG for the right-side curve of the drip */}
      <svg
        width="6"
        height="6"
        viewBox="0 0 6 6"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute left-full top-0"
      >
        <g clipPath="url(#clip0_1077_28)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.4 0H0V5.4C0 2.41765 2.41766 0 5.4 0Z"
            fill={svgFill}
            className="transition-colors"
          />
        </g>
        <defs>
          <clipPath id="clip0_1077_28">
            <rect width="6" height="6" fill="white" />
          </clipPath>
        </defs>
      </svg>

      {/* SVG for the left-side curve of the drip */}
      <svg
        width="6"
        height="6"
        viewBox="0 0 6 6"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute right-full top-0 rotate-90"
      >
        <g clipPath="url(#clip0_1077_28)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5.4 0H0V5.4C0 2.41765 2.41766 0 5.4 0Z"
            fill={svgFill}
            className="transition-colors"
          />
        </g>
        <defs>
          <clipPath id="clip0_1077_28">
            <rect width="6" height="6" fill="white" />
          </clipPath>
        </defs>
      </svg>

      {/* A smaller, detached droplet that falls */}
      <motion.div
        initial={{ y: -8, opacity: 1 }}
        animate={{ y: [-8, 50], opacity: [1, 0] }}
        transition={{
          duration: 2,
          times: [0, 1],
          delay,
          ease: "easeIn",
          repeat: Infinity,
          repeatDelay: 2,
        }}
        className={cn("absolute top-full h-2 w-2 rounded-full transition-colors drop-shadow-sm", color, hoverColor)}
      />
    </motion.div>
  );
};

export default WetPaintButton;
