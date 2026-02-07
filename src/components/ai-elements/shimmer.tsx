"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  type CSSProperties,
  type ElementType,
  memo,
  useMemo,
} from "react";

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  );

  const motionProps = {
    animate: { backgroundPosition: "0% center" },
    className: cn(
      "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
      "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
      className
    ),
    initial: { backgroundPosition: "100% center" },
    style: {
      "--spread": `${dynamicSpread}px`,
      backgroundImage:
        "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
    } as CSSProperties,
    transition: {
      repeat: Number.POSITIVE_INFINITY,
      duration,
      ease: "linear" as const,
    },
  };

  // Use motion component based on the 'as' prop
  if (Component === "span") {
    return <motion.span {...motionProps}>{children}</motion.span>;
  }
  if (Component === "div") {
    return <motion.div {...motionProps}>{children}</motion.div>;
  }
  if (Component === "h1") {
    return <motion.h1 {...motionProps}>{children}</motion.h1>;
  }
  if (Component === "h2") {
    return <motion.h2 {...motionProps}>{children}</motion.h2>;
  }
  if (Component === "h3") {
    return <motion.h3 {...motionProps}>{children}</motion.h3>;
  }
  // Default to paragraph
  return <motion.p {...motionProps}>{children}</motion.p>;
};

export const Shimmer = memo(ShimmerComponent);

