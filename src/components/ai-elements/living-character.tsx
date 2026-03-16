'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface LivingCharacterProps {
    isThinking?: boolean;
    className?: string;
}

export function LivingCharacter({ isThinking = false, className }: LivingCharacterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const faceRef = useRef<SVGGElement>(null);
    const targetPos = useRef({ x: 0, y: 0 });
    const currentPos = useRef({ x: 0, y: 0 });
    const animationFrameId = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            if (isThinking) {
                targetPos.current = { x: 0, y: 0 };
                return;
            }

            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Subtle multiplier for smooth distance
            const dx = (e.clientX - centerX) / 25;
            const dy = (e.clientY - centerY) / 25;

            // Clamp values
            targetPos.current = {
                x: Math.max(Math.min(dx, 8), -8),
                y: Math.max(Math.min(dy, 5), -5)
            };
        };

        const handleMouseLeave = () => {
            targetPos.current = { x: 0, y: 0 };
        };

        const animate = () => {
            // Lerp (Linear Interpolation) for butter-smooth movement
            // current = current + (target - current) * stiffness
            const lerpAmount = 0.08;

            currentPos.current.x += (targetPos.current.x - currentPos.current.x) * lerpAmount;
            currentPos.current.y += (targetPos.current.y - currentPos.current.y) * lerpAmount;

            if (faceRef.current) {
                faceRef.current.style.transform = `translate(${currentPos.current.x}px, ${currentPos.current.y}px)`;
            }

            animationFrameId.current = requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [isThinking]);

    return (
        <div className={cn("flex flex-col items-center gap-6", className)}>
            <style>{`
        @keyframes hover {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }

        @keyframes hover-fast {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }

        @keyframes shadow-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.85); opacity: 0.5; }
        }

        @keyframes blink {
          0%, 4%, 100% { transform: scaleY(1); }
          2% { transform: scaleY(0.1); }
        }

        @keyframes pulse-light {
          0%, 100% { opacity: 0.6; filter: drop-shadow(0 0 2px #60A5FA); }
          50% { opacity: 1; filter: drop-shadow(0 0 6px #60A5FA); }
        }

        @keyframes loading-dot {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); filter: drop-shadow(0 0 4px #60A5FA); }
        }

        .bot-hover-animation {
          animation: hover 4s ease-in-out infinite;
          transform-origin: center;
        }

        .thinking .bot-hover-animation {
          animation: hover 2s ease-in-out infinite;
        }

        .floor-shadow-animation {
          transform-origin: center;
          animation: shadow-pulse 4s ease-in-out infinite;
        }

        .thinking .floor-shadow-animation {
          animation: shadow-pulse 2s ease-in-out infinite;
        }

        .eye-animation {
          transform-origin: center;
          transform-box: fill-box;
          animation: blink 6s infinite 1s;
        }

        .antenna-pulse {
          animation: pulse-light 3s infinite;
        }

        .dot-1 { animation: loading-dot 1.2s infinite 0s; }
        .dot-2 { animation: loading-dot 1.2s infinite 0.2s; }
        .dot-3 { animation: loading-dot 1.2s infinite 0.4s; }

        .bot-tilt-transition {
          transform-origin: 75px 80px;
          transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .thinking .bot-tilt-transition {
          transform: rotate(6deg);
        }
      `}</style>

            {/* Character Container */}
            <div
                ref={containerRef}
                className={cn(
                    "relative w-[180px] h-[180px] flex justify-center items-center",
                    isThinking && "thinking"
                )}
            >
                <svg viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg" className="overflow-visible w-full h-full">
                    {/* Floor Shadow */}
                    <ellipse
                        className="floor-shadow-animation fill-slate-900/10 dark:fill-white/5"
                        cx="75" cy="135" rx="35" ry="6"
                    />

                    {/* Entire bot group */}
                    <g className="bot-hover-animation">
                        <g className="bot-tilt-transition">
                            {/* Antenna */}
                            <line
                                x1="75" y1="28" x2="75" y2="45"
                                className="stroke-slate-200 dark:stroke-slate-700 stroke-[3] stroke-linecap-round"
                            />
                            <circle
                                cx="75" cy="28" r="4.5"
                                className="antenna-pulse fill-blue-600"
                            />

                            {/* Main Head Base */}
                            <rect
                                x="30" y="45" width="90" height="70" rx="28"
                                className="fill-white dark:fill-slate-900 stroke-slate-200 dark:stroke-slate-800 stroke-[2]"
                            />

                            {/* Bevel effect */}
                            <path
                                d="M30,73 C30,45 120,45 120,73"
                                fill="none" stroke="white" strokeWidth="4" opacity="0.4"
                            />

                            {/* Face Area with Parallax */}
                            <g
                                ref={faceRef}
                                className="transition-transform duration-300 ease-out"
                                style={{
                                    // When thinking, we want a snappier return to center via CSS if needed,
                                    // but generally the lerp loop handles the smoothness.
                                    transition: isThinking ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none'
                                }}
                            >
                                {/* Visor */}
                                <rect
                                    x="42" y="58" width="66" height="34" rx="14"
                                    className="fill-slate-900 dark:fill-black"
                                />

                                {/* Visor Glare */}
                                <path
                                    d="M46,62 Q75,58 104,62"
                                    fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.1"
                                />

                                {!isThinking ? (
                                    /* Idle Eyes */
                                    <g className="eye-group transition-opacity duration-300">
                                        <rect
                                            x="58" y="67" width="8" height="16" rx="4"
                                            className="eye-animation fill-blue-400"
                                            style={{ filter: 'drop-shadow(0 0 3px rgba(96, 165, 250, 0.6))' }}
                                        />
                                        <rect
                                            x="84" y="67" width="8" height="16" rx="4"
                                            className="eye-animation fill-blue-400"
                                            style={{ filter: 'drop-shadow(0 0 3px rgba(96, 165, 250, 0.6))' }}
                                        />
                                    </g>
                                ) : (
                                    /* Thinking UI */
                                    <g className="thinking-ui transition-opacity duration-300">
                                        <circle className="dot dot-1 fill-blue-400" cx="60" cy="75" r="3.5" />
                                        <circle className="dot dot-2 fill-blue-400" cx="75" cy="75" r="3.5" />
                                        <circle className="dot dot-3 fill-blue-400" cx="90" cy="75" r="3.5" />
                                    </g>
                                )}
                            </g>
                        </g>
                    </g>
                </svg>
            </div>
        </div>
    );
}
