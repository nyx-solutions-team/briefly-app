"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Lock, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SignInPage() {
    const router = useRouter();
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSigningIn(true);
        try {
            const success = await signIn({ username: email, password });
            if (success) {
                router.push('/dashboard');
            } else {
                setError('Invalid email or password.');
            }
        } finally {
            setIsSigningIn(false);
        }
    };

    useEffect(() => {
        // Load GSAP from CDN for the cool animations
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
        script.async = true;
        script.onload = () => {
            const gsap = (window as any).gsap;
            if (!gsap) return;

            // Stagger right side form entry
            gsap.from(".animate-in", {
                y: 20,
                opacity: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out",
                delay: 0.2
            });

            // Scanner Loop on the left side
            const scannerTl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
            scannerTl.fromTo("#scanner",
                { top: "0%", opacity: 0 },
                { top: "20%", opacity: 1, duration: 0.4, ease: "linear" }
            )
                .to("#scanner", { top: "100%", duration: 2, ease: "linear" })
                .to("#scanner", { opacity: 0, duration: 0.2 });

            // Progress Bar Sync on the left side
            const progressTl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
            progressTl.fromTo("#progress-bar",
                { width: "0%" },
                { width: "100%", duration: 2.4, ease: "power1.inOut", delay: 0.4 }
            );

            // Floating document stack
            gsap.to("#doc-stack", { y: -15, duration: 5, ease: "sine.inOut", yoyo: true, repeat: -1 });
        };
        document.head.appendChild(script);

        return () => {
            const existingScript = document.querySelector('script[src*="gsap"]');
            if (existingScript) existingScript.remove();
        };
    }, []);

    return (
        <div className="h-screen w-full flex overflow-hidden bg-white text-gray-900 font-sans">
            {/* LEFT PANEL: Branding & Visuals (Dark Themed) */}
            <div className="hidden lg:flex w-1/2 flex-col justify-between p-16 relative bg-[#1A1A19] text-[#EDEDEC] overflow-hidden border-r border-white/5 shadow-2xl z-10">

                {/* Subtle Background Pattern */}
                <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />

                {/* Brand */}
                <div className="z-20">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 backdrop-blur-sm shadow-sm hover:scale-105 transition-transform cursor-pointer">
                            <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                            </svg>
                        </div>
                        <span className="text-white font-bold text-2xl tracking-tight">Briefly Docs.</span>
                    </div>
                </div>

                {/* Dynamic Visual: The Document Engine */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-[340px] h-[460px] drop-shadow-2xl" id="doc-stack">
                        {/* Ambient Glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-amber-500/20 blur-[100px] rounded-full" />

                        {/* Faux Render Stack Layers */}
                        <div className="absolute inset-0 bg-white/[0.03] border border-white/10 rounded-2xl transform rotate-[-6deg] translate-x-[-12px] translate-y-[-6px] shadow-lg backdrop-blur-lg"></div>
                        <div className="absolute inset-0 bg-white/[0.05] border border-white/10 rounded-2xl transform rotate-[3deg] translate-x-[6px] translate-y-[3px] shadow-xl backdrop-blur-lg"></div>

                        {/* Forefront Panel */}
                        <div className="absolute inset-0 z-20 bg-[#232325]/90 backdrop-blur-3xl border border-white/10 p-8 flex flex-col overflow-hidden rounded-2xl shadow-2xl">
                            {/* Animated Scanner Beam */}
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.8)] z-30 opacity-80" id="scanner"></div>

                            {/* Fake UI Header */}
                            <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-6">
                                <div className="text-white/40 text-[10px] uppercase font-mono tracking-widest">Job: 9921-X</div>
                                <div className="bg-amber-500/10 text-amber-500 px-2.5 py-1 text-[9px] font-bold border border-amber-500/20 rounded uppercase tracking-wider">
                                    Analyzing
                                </div>
                            </div>

                            {/* Skeleton Document Lines */}
                            <div className="space-y-4 flex-1">
                                <div className="w-full h-1.5 bg-white/20 rounded-full"></div>
                                <div className="w-5/6 h-1.5 bg-white/20 rounded-full"></div>
                                <div className="w-full h-1.5 bg-white/20 rounded-full"></div>
                                <div className="flex gap-2 mt-6">
                                    <div className="w-1/3 h-16 border border-white/10 bg-white/5 rounded-lg"></div>
                                    <div className="w-2/3 h-16 border border-white/10 bg-white/5 rounded-lg"></div>
                                </div>
                                <div className="mt-6 w-full h-1.5 bg-white/20 rounded-full"></div>
                                <div className="w-3/4 h-1.5 bg-white/20 rounded-full"></div>
                            </div>

                            {/* Extraction Progress Footer */}
                            <div className="absolute bottom-6 left-8 right-8">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 text-amber-500/80 text-[10px] font-mono">
                                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></div>
                                        <span>EXTRACTING DATA...</span>
                                    </div>
                                    <span className="text-white/30 text-[9px] font-mono">4.2ms</span>
                                </div>
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 w-0" id="progress-bar"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Meta */}
                <div className="z-20 relative">
                    <div className="absolute -left-16 bottom-0 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full mix-blend-screen" />
                    <h2 className="text-[2.5rem] text-white font-bold leading-[1.1] mb-5 tracking-tight">
                        Intelligence layer for <br />
                        <span className="text-white/40">unstructured data.</span>
                    </h2>
                    <div className="flex gap-5 text-[10px] text-white/50 uppercase tracking-widest font-mono">
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            RAG Engine Live
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-white/30"></span>
                            SOC2 Secure
                        </span>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: The Login Form */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 md:p-12 relative bg-[#F8FAFC]">
                {/* Subtle Dot Grid Background */}
                <div className="absolute inset-0 opacity-[0.8] pointer-events-none" style={{
                    backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
                    backgroundSize: '24px 24px'
                }}></div>

                {/* Main Glassmorphic Form Card */}
                <div className="w-full max-w-[420px] bg-white border border-gray-200/60 rounded-[1.25rem] shadow-[0_12px_48px_-12px_rgba(0,0,0,0.08)] p-8 md:p-10 relative z-10 animate-in backdrop-blur-xl">

                    {/* Mobile Only Branding */}
                    <div className="lg:hidden flex items-center justify-center gap-2 mb-8 animate-in">
                        <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white">
                            <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                <polyline points="13 2 13 9 20 9"></polyline>
                            </svg>
                        </div>
                        <span className="font-bold text-xl text-gray-900">Briefly Docs.</span>
                    </div>

                    <div className="mb-8 text-center lg:text-left animate-in">
                        <h1 className="text-[1.75rem] font-bold tracking-tight text-gray-900 mb-1.5">Welcome back</h1>
                        <p className="text-sm text-gray-500">Enter your credentials to access the workspace.</p>
                    </div>

                    {/* Form */}
                    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                        <div className="space-y-4 animate-in">
                            {/* Email Input */}
                            <div className="space-y-1.5 group">
                                <label className="text-[13px] font-semibold text-gray-700">Email address</label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-11 pl-4 pr-10 bg-gray-50/50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-sm group-hover:border-gray-300"
                                        placeholder="name@company.com"
                                        required
                                        disabled={isSigningIn}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5h11C20 5 22 7 22 9.5v7.5z" /><polyline points="2.27 9 12 15.25 21.73 9" /></svg>
                                    </div>
                                </div>
                            </div>

                            {/* Password Input */}
                            <div className="space-y-1.5 group">
                                <div className="flex justify-between items-center">
                                    <label className="text-[13px] font-semibold text-gray-700">Password</label>
                                    <a href="#" className="text-[12px] text-amber-600 hover:text-amber-700 font-medium transition-colors">Forgot password?</a>
                                </div>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full h-11 pl-4 pr-10 bg-gray-50/50 border border-gray-200 rounded-xl text-[14px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all shadow-sm group-hover:border-gray-300"
                                        placeholder="••••••••"
                                        required
                                        disabled={isSigningIn}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-lg text-center animate-in fade-in zoom-in-95">
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            disabled={isSigningIn || !email || !password}
                            size="lg"
                            className={cn(
                                "w-full h-12 text-sm font-semibold rounded-xl bg-gray-900 hover:bg-black text-white shadow-xl shadow-gray-900/10 transition-all duration-300 active:scale-[0.98]",
                                (isSigningIn || !email || !password) && "opacity-50"
                            )}
                        >
                            {isSigningIn ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign in to Workspace</span>
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </>
                            )}
                        </Button>

                    </form>

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-gray-100 flex gap-4 text-[12px] text-gray-400 font-medium justify-center animate-in">
                        <span className="flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> Secure</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> Fast</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> Intelligent</span>
                    </div>
                </div>

                <p className="absolute bottom-6 text-xs text-gray-400/80">© 2026 Briefly Docs, Inc. All rights reserved.</p>
            </div>
        </div>
    );
}
