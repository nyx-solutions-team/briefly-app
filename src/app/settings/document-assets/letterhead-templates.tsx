import React from "react";
import { LetterheadBuilderForm } from "./letterhead-types";

export function initialsFromName(value: string) {
    const tokens = String(value || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);
    if (tokens.length === 0) return "BD";
    return tokens.map((token) => token[0]?.toUpperCase() || "").join("") || "BD";
}

export function getLetterheadLogoWidth(scale: LetterheadBuilderForm["logo_scale"]) {
    if (scale === "small") return 72;
    if (scale === "large") return 132;
    return 96;
}

export function LetterheadThemeRenderer({ builder }: { builder: LetterheadBuilderForm }) {
    const metaRows = [builder.email, builder.phone, builder.website].filter(Boolean);
    const accentHex = builder.accent_color || "#f97316";
    const textHex = builder.text_color || "#0f172a";
    const mono = builder.monogram || initialsFromName(builder.brand_name);
    const hasLogo = Boolean(builder.logo_data_url);
    const logoWidth = getLetterheadLogoWidth(builder.logo_scale);
    const theme = builder.theme || "modern";

    const renderLogo = (alignmentCheck: string, forceTextHex?: string) => {
        if (builder.logo_alignment !== alignmentCheck) return null;
        if (hasLogo) {
            return (
                <div
                    style={{
                        width: logoWidth,
                        minWidth: logoWidth,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 10,
                        borderRadius: theme === "modern" ? 18 : 8,
                        border: theme === "modern" ? "1px solid rgba(226,232,240,1)" : "none",
                        backgroundColor: "#ffffff",
                    }}
                >
                    <img
                        src={builder.logo_data_url}
                        alt=""
                        style={{ display: "block", maxWidth: "100%", maxHeight: logoWidth * 0.72, objectFit: "contain" }}
                    />
                </div>
            );
        }
        if (alignmentCheck === "left" || alignmentCheck === "right" || alignmentCheck === "center") {
            const isMinimalType = ["minimal", "clean", "classic", "elegant", "organic"].includes(theme);
            const isBoldType = ["bold", "tech", "modern", "professional", "creative"].includes(theme);

            return (
                <div
                    style={{
                        height: 64,
                        width: 64,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: isMinimalType ? 8 : (theme === "organic" ? 32 : 16),
                        fontSize: 18,
                        fontWeight: 600,
                        letterSpacing: "0.28em",
                        color: forceTextHex || (isMinimalType ? textHex : "#ffffff"),
                        background: isMinimalType ? `${accentHex}15` : `linear-gradient(135deg, ${accentHex} 0%, ${textHex} 100%)`,
                        border: isMinimalType ? `1px solid ${accentHex}40` : "none",
                    }}
                >
                    {mono}
                </div>
            );
        }
        return null;
    };

    if (theme === "minimal") {
        return (
            <div style={{ padding: "48px 48px 24px 48px" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, paddingBottom: 24, borderBottom: `2px solid ${accentHex}40` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        {renderLogo("left")}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: textHex }}>
                                {builder.brand_name || "Your Company"}
                            </div>
                            <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b" }}>
                                {builder.tagline || "Tagline goes here"}
                            </div>
                        </div>
                    </div>
                    {renderLogo("right")}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 16 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                        {metaRows.map((row) => (
                            <div key={row} style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>{row}</div>
                        ))}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.6, color: "#94a3b8" }}>
                        {builder.address_line ? <div>{builder.address_line}</div> : null}
                        {builder.city_line ? <div>{builder.city_line}</div> : null}
                        {builder.registration_line ? <div>{builder.registration_line}</div> : null}
                    </div>
                </div>
            </div>
        );
    }

    if (theme === "professional") {
        return (
            <div style={{ padding: "40px" }}>
                <div style={{ height: 4, width: "100%", background: textHex, marginBottom: 32 }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
                    {hasLogo ? (
                        <div style={{ height: logoWidth * 0.8 }}>
                            <img src={builder.logo_data_url} alt="" style={{ display: "block", height: "100%", objectFit: "contain" }} />
                        </div>
                    ) : (
                        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "0.4em", color: textHex }}>{mono}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{ fontSize: 36, fontWeight: 600, color: textHex }}>{builder.brand_name || "Your Company"}</div>
                        {builder.tagline && <div style={{ fontSize: 14, color: accentHex }}>{builder.tagline}</div>}
                    </div>

                    <div style={{ width: 120, height: 1, backgroundColor: "#e2e8f0", margin: "12px 0" }} />

                    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, fontSize: 12, color: "#64748b" }}>
                        {metaRows.length > 0 ? metaRows.map((r, i) => (
                            <React.Fragment key={r}>
                                {i > 0 && <span style={{ color: "#cbd5e1" }}>•</span>}
                                <span>{r}</span>
                            </React.Fragment>
                        )) : null}
                    </div>

                    {(builder.address_line || builder.city_line || builder.registration_line) && (
                        <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                            {builder.address_line && <span>{builder.address_line}</span>}
                            {builder.city_line && <><span style={{ color: "#cbd5e1" }}>|</span><span>{builder.city_line}</span></>}
                            {builder.registration_line && <><span style={{ color: "#cbd5e1" }}>|</span><span>{builder.registration_line}</span></>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (theme === "elegant") {
        return (
            <div style={{ padding: "48px 64px", fontFamily: "Georgia, serif", textAlign: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                    {hasLogo ? (
                        <div style={{ height: logoWidth }}>
                            <img src={builder.logo_data_url} alt="" style={{ display: "block", height: "100%", objectFit: "contain" }} />
                        </div>
                    ) : (
                        <div style={{ fontSize: 28, fontWeight: 400, letterSpacing: "0.3em", color: textHex, paddingBottom: 16 }}>{mono}</div>
                    )}
                    <div style={{ fontSize: 42, color: textHex, fontStyle: "italic", letterSpacing: "0.02em" }}>{builder.brand_name || "Your Company"}</div>
                    {builder.tagline && <div style={{ fontSize: 14, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.15em" }}>{builder.tagline}</div>}

                    <div style={{ width: "100%", height: 1, backgroundColor: accentHex, margin: "24px 0", opacity: 0.3 }} />

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: textHex, fontFamily: "system-ui, sans-serif" }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: 24 }}>
                            {metaRows.map((r) => (<span key={r}>{r}</span>))}
                        </div>
                        <div style={{ color: "#64748b" }}>
                            {[builder.address_line, builder.city_line, builder.registration_line].filter(Boolean).join(" • ")}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (theme === "bold") {
        return (
            <div>
                <div style={{ backgroundColor: textHex, color: "#ffffff", padding: "48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                        {hasLogo ? (
                            <div style={{ padding: 12, backgroundColor: "#ffffff", borderRadius: 8 }}>
                                <img src={builder.logo_data_url} alt="" style={{ width: logoWidth, maxHeight: logoWidth * 0.8, objectFit: "contain" }} />
                            </div>
                        ) : (
                            renderLogo("left", "#ffffff")
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: "-0.05em", color: "#ffffff" }}>{builder.brand_name || "COMPANY"}</div>
                            {builder.tagline && <div style={{ fontSize: 16, fontWeight: 500, color: accentHex, textTransform: "uppercase", letterSpacing: "0.1em" }}>{builder.tagline}</div>}
                        </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 13, lineHeight: 1.6, color: "#cbd5e1", maxWidth: 300 }}>
                        {metaRows.map(r => <div key={r}>{r}</div>)}
                    </div>
                </div>
                <div style={{ backgroundColor: accentHex, padding: "12px 48px", color: "#ffffff", fontSize: 12, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                    <div>{[builder.address_line, builder.city_line].filter(Boolean).join(", ")}</div>
                    <div>{builder.registration_line}</div>
                </div>
            </div>
        );
    }

    if (theme === "clean") {
        return (
            <div style={{ padding: "40px 48px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 40 }}>
                    <div style={{ width: 160, flexShrink: 0 }}>
                        {hasLogo ? (
                            <img src={builder.logo_data_url} alt="" style={{ width: "100%", objectFit: "contain" }} />
                        ) : (
                            <div style={{ fontSize: 32, fontWeight: 800, color: accentHex }}>{mono}</div>
                        )}
                    </div>

                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
                        <div style={{ paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: textHex }}>{builder.brand_name || "Your Company"}</div>
                            {builder.tagline && <div style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>{builder.tagline}</div>}
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {builder.address_line && <div>{builder.address_line}</div>}
                                {builder.city_line && <div>{builder.city_line}</div>}
                                {builder.registration_line && <div>{builder.registration_line}</div>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right", fontWeight: 500, color: textHex }}>
                                {metaRows.map(r => <div key={r}>{r}</div>)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Classic Two-Column
    if (theme === "classic") {
        return (
            <div style={{ padding: "48px", borderTop: `8px solid ${textHex}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {hasLogo ? (
                            <img src={builder.logo_data_url} alt="" style={{ width: logoWidth, objectFit: "contain" }} />
                        ) : (
                            <div style={{ fontSize: 36, fontWeight: 300, color: textHex, letterSpacing: "0.1em" }}>{mono}</div>
                        )}
                        <div style={{ fontSize: 24, fontWeight: 600, color: textHex }}>{builder.brand_name || "Your Company"}</div>
                        {builder.tagline && <div style={{ fontSize: 13, color: accentHex, fontStyle: "italic" }}>{builder.tagline}</div>}
                    </div>

                    <div style={{ borderLeft: `2px solid ${accentHex}`, paddingLeft: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: "#475569" }}>
                            {builder.address_line && <div>{builder.address_line}</div>}
                            {builder.city_line && <div>{builder.city_line}</div>}
                            {builder.registration_line && <div>{builder.registration_line}</div>}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.6, color: textHex, fontWeight: 500 }}>
                            {metaRows.map(r => <div key={r}>{r}</div>)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Creative Sidebar
    if (theme === "creative") {
        return (
            <div style={{ display: "flex", minHeight: 160 }}>
                <div style={{ width: 100, backgroundColor: accentHex, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    {hasLogo ? (
                        <div style={{ padding: 8, backgroundColor: "#ffffff", borderRadius: 12 }}>
                            <img src={builder.logo_data_url} alt="" style={{ width: "100%", objectFit: "contain" }} />
                        </div>
                    ) : (
                        <div style={{ color: "#ffffff", fontSize: 24, fontWeight: 800, transform: "rotate(-90deg)" }}>{mono}</div>
                    )}
                </div>
                <div style={{ flex: 1, padding: "40px", backgroundColor: "#f8fafc", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div style={{ fontSize: 32, fontWeight: 800, color: textHex, letterSpacing: "-0.02em" }}>{builder.brand_name || "Your Company"}</div>
                    {builder.tagline && <div style={{ fontSize: 15, color: "#64748b", marginTop: 4 }}>{builder.tagline}</div>}
                    <div style={{ marginTop: 24, paddingBottom: 20, display: "flex", gap: 32, fontSize: 13, color: textHex, borderBottom: "2px solid #e2e8f0" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {metaRows.map(r => <div key={r}>• {r}</div>)}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "#64748b" }}>
                            {builder.address_line && <div>{builder.address_line}</div>}
                            {builder.city_line && <div>{builder.city_line}</div>}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Tech Startup
    if (theme === "tech") {
        return (
            <div style={{ padding: "32px 48px", background: `linear-gradient(to right, #ffffff, #f1f5f9)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                        {hasLogo ? (
                            <img src={builder.logo_data_url} alt="" style={{ height: 48, objectFit: "contain" }} />
                        ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, backgroundColor: textHex, color: accentHex, borderRadius: 12, fontWeight: 700, fontSize: 18 }}>{mono}</div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.05em", color: textHex }}>{builder.brand_name || "STARTUP.IO"}</div>
                            {builder.tagline && <div style={{ fontSize: 12, fontWeight: 600, color: accentHex, textTransform: "uppercase" }}>{builder.tagline}</div>}
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#475569", fontWeight: 500 }}>
                        {metaRows.map(r => (
                            <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentHex }}></div>
                                {r}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Organic Earth
    if (theme === "organic") {
        return (
            <div style={{ padding: "48px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -80, right: -80, width: 200, height: 200, borderRadius: "50%", backgroundColor: `${accentHex}1A` }}></div>
                <div style={{ position: "absolute", bottom: -40, left: 100, width: 120, height: 120, borderRadius: "50%", backgroundColor: `${textHex}0A` }}></div>

                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 40, zIndex: 10 }}>
                    {hasLogo ? (
                        <img src={builder.logo_data_url} alt="" style={{ width: logoWidth, objectFit: "contain" }} />
                    ) : (
                        <div style={{ width: 80, height: 80, borderRadius: "50%", backgroundColor: textHex, color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 500 }}>{mono}</div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 32, fontWeight: 500, color: textHex, letterSpacing: "0.05em" }}>{builder.brand_name || "Your Company"}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: accentHex, fontWeight: 500 }}>
                            {metaRows.map(r => <div key={r}>{r}</div>)}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>
                            {[builder.address_line, builder.city_line].filter(Boolean).join(" • ")}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // default to modern theme
    return (
        <>
            <div style={{ height: 16, width: "100%", background: `linear-gradient(90deg, ${accentHex} 0%, ${textHex} 100%)` }} />
            <div style={{ padding: "40px 48px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 40 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
                        {renderLogo("left")}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.04em", color: textHex }}>
                                {builder.brand_name || "Your Company"}
                            </div>
                            <div style={{ maxWidth: 420, fontSize: 14, lineHeight: 1.6, color: "#64748b" }}>
                                {builder.tagline || "Add a short company tagline for this letterhead."}
                            </div>
                        </div>
                    </div>
                    <div style={{ minWidth: 300, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
                        {renderLogo("right")}
                        {metaRows.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                                {metaRows.map((row) => (
                                    <div key={row} style={{ borderRadius: 999, border: `1px solid ${accentHex}40`, padding: "6px 12px", fontSize: 12, fontWeight: 500, color: textHex, backgroundColor: `${accentHex}15` }}>
                                        {row}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "right", fontSize: 13, lineHeight: 1.5, color: "#64748b" }}>
                            {builder.address_line ? <div>{builder.address_line}</div> : null}
                            {builder.city_line ? <div>{builder.city_line}</div> : null}
                            {builder.registration_line ? <div>{builder.registration_line}</div> : null}
                        </div>
                    </div>
                </div>
                <div style={{ marginTop: 32, height: 1, width: "100%", background: `linear-gradient(90deg, ${accentHex} 0%, ${accentHex}55 35%, rgba(148,163,184,0.18) 100%)` }} />
            </div>
        </>
    );
}
