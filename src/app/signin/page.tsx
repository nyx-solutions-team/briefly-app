"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { clsx } from 'clsx';

export default function SignInPage() {
  const { isAuthenticated, signIn, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSigningIn(true);
    try {
      const ok = await signIn({ username: email, password });
      if (ok) router.push('/dashboard');
      else setError('Invalid email or password.');
    } finally {
      setIsSigningIn(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    // Load GSAP from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
    script.async = true;
    script.onload = () => {
      const gsap = (window as any).gsap;
      if (!gsap) return;

      // 1. Right Side Entry - Staggered
      gsap.from(".animate-in", {
        y: 20,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        delay: 0.2
      });

      // 2. Left Side: Scanner Loop
      const scannerTl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
      
      scannerTl.fromTo("#scanner", 
        { top: "0%", opacity: 0 },
        { top: "20%", opacity: 1, duration: 0.4, ease: "linear" }
      )
      .to("#scanner", {
        top: "100%",
        duration: 2,
        ease: "linear"
      })
      .to("#scanner", { opacity: 0, duration: 0.2 });

      // 3. Left Side: Progress Bar Sync
      const progressTl = gsap.timeline({ repeat: -1, repeatDelay: 0.5 });
      progressTl.fromTo("#progress-bar",
        { width: "0%" },
        { width: "100%", duration: 2.4, ease: "power1.inOut", delay: 0.4 }
      );

      // 4. Left Side: Floating Stack
      gsap.to("#doc-stack", {
        y: -15,
        duration: 5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1
      });
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove script if component unmounts
      const existingScript = document.querySelector('script[src*="gsap"]');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex overflow-hidden bg-background text-foreground">
        <div className="hidden lg:flex w-1/2 flex-col justify-between p-16 relative bg-[#1A1A19] text-[#EDEDEC] overflow-hidden">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-white/10 rounded mb-4"></div>
            <div className="h-1 w-24 bg-white/20 rounded"></div>
          </div>
        </div>
        <div className="w-full lg:w-1/2 bg-background flex items-center justify-center p-8"></div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return (
    <div className="h-screen w-full flex overflow-hidden bg-background text-foreground font-sans">
      {/* LEFT PANEL: The Engine (Dark Themed for Contrast) */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-16 relative bg-[#1A1A19] text-[#EDEDEC] overflow-hidden">
        {/* Background Texture */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}></div>
        
        {/* Brand */}
        <div className="z-20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            </div>
            <span className="text-white font-bold text-2xl tracking-tight">Briefly Docs.</span>
          </div>
          <div className="h-[1px] w-12 bg-white/20"></div>
        </div>

        {/* Central Visual: Scanning Core */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-[340px] h-[460px]" id="doc-stack">
            {/* Stack Layers */}
            <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-xl transform rotate-[-6deg] translate-x-[-12px] translate-y-[-6px] shadow-2xl"></div>
            <div className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl transform rotate-[3deg] translate-x-[6px] translate-y-[3px] shadow-2xl"></div>
            
            {/* Front Layer */}
            <div className="absolute inset-0 z-20 bg-[#232325] border border-white/10 p-8 flex flex-col overflow-hidden rounded-xl shadow-2xl">
              {/* Scanner Beam */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.6)] z-30 opacity-80" id="scanner"></div>

              {/* Header of Doc */}
              <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-6">
                <div className="text-white/40 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>ID: 9921-X</div>
                <div className="bg-blue-500/20 text-blue-400 px-2 py-1 text-[9px] font-bold border border-blue-400/30 rounded-md uppercase tracking-wider">
                  Confidential
                </div>
              </div>

              {/* Content Lines */}
              <div className="space-y-4 flex-1 opacity-40">
                <div className="w-full h-1.5 bg-white/30 rounded-full"></div>
                <div className="w-5/6 h-1.5 bg-white/30 rounded-full"></div>
                <div className="w-full h-1.5 bg-white/30 rounded-full"></div>
                <div className="flex gap-2 mt-4">
                  <div className="w-1/3 h-16 border border-white/20 rounded-lg"></div>
                  <div className="w-2/3 h-16 border border-white/20 rounded-lg"></div>
                </div>
                <div className="mt-4 w-full h-1.5 bg-white/30 rounded-full"></div>
                <div className="w-4/5 h-1.5 bg-white/30 rounded-full"></div>
              </div>

              {/* Live Extraction Badge (Animated) */}
              <div className="absolute bottom-8 left-8 right-8" id="data-extraction">
                <div className="flex items-center gap-3 text-white/50 text-[10px] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                  <span>EXTRACTING ENTITIES...</span>
                </div>
                <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 w-0" id="progress-bar"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Meta */}
        <div className="z-20">
          <h2 className="text-3xl text-white font-bold leading-tight mb-3">
            Intelligence layer for <br />
            <span className="text-white/50">unstructured data.</span>
          </h2>
          <div className="flex gap-4 text-[10px] text-white/40 uppercase tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span>● RAG Engine Active</span>
            <span>● SOC2 Secure</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: The Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 md:p-12 relative bg-[#F9FAFB]">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-[0.6] pointer-events-none" style={{
          backgroundImage: 'linear-gradient(#E5E7EB 1px, transparent 1px), linear-gradient(90deg, #E5E7EB 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}></div>


        {/* Main Card */}
        <div className="w-full max-w-[440px] bg-white border border-gray-200/80 rounded-2xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] p-8 md:p-10 relative z-10 animate-in">
          {/* Mobile Brand */}
          <div className="lg:hidden flex items-center gap-2 mb-6 justify-center">
            <div className="w-8 h-8 bg-[#1A1A19] rounded-lg flex items-center justify-center text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
            </div>
            <span className="font-bold text-xl text-gray-900">Briefly Docs.</span>
          </div>

          {/* Header */}
          <div className="mb-8 text-center md:text-left">
            <h1 className="text-[28px] font-bold tracking-tight text-[#111827] mb-2">Welcome back</h1>
          </div>

          {/* Form */}
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[#374151]">Email address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-4 bg-[#F3F4F6] border border-transparent rounded-lg text-[14px] text-[#111827] placeholder:text-gray-400 focus:bg-white focus:border-[#1A1A19] focus:ring-4 focus:ring-gray-100 outline-none transition-all"
                placeholder="name@company.com"
                required
                disabled={isSigningIn}
              />
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[#374151]">Password</label>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-4 bg-[#F3F4F6] border border-transparent rounded-lg text-[14px] text-[#111827] placeholder:text-gray-400 focus:bg-white focus:border-[#1A1A19] focus:ring-4 focus:ring-gray-100 outline-none transition-all"
                placeholder="••••••••"
                required
                disabled={isSigningIn}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={isSigningIn || !email || !password}
              className={clsx(
                "h-11 w-full bg-[#1A1A19] text-white font-semibold text-[14px] rounded-lg shadow-md hover:bg-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 mt-2",
                (isSigningIn || !email || !password) && "opacity-80 cursor-not-allowed"
              )}
            >
              {isSigningIn ? (
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign in</>
              )}
            </button>
            
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 flex gap-2 text-[12px] text-gray-500 font-medium justify-center">
            <a href="#" className="hover:text-[#1A1A19] transition-colors">Secure</a>
            <span>•</span>
            <a href="#" className="hover:text-[#1A1A19] transition-colors">Fast</a>
            <span>•</span>
            <a href="#" className="hover:text-[#1A1A19] transition-colors">Intelligent</a>
          </div>
        </div>
      </div>
    </div>
  );
}
