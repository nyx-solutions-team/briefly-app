"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Eye, FileText, Receipt, Building2, ShieldCheck, CreditCard, Sparkles } from 'lucide-react';

export type DocumentTemplateOption = {
    template_id: string;
    name: string;
    description?: string;
    badge?: string;
    field_count?: number;
    sample_field_labels?: string[];
};

type TemplateTrayProps = {
    templates: DocumentTemplateOption[];
    onSelect: (template: DocumentTemplateOption) => void;
    onPreview?: (template: DocumentTemplateOption) => void;
};

const getTemplateIcon = (id: string) => {
    const mid = id.toLowerCase();
    if (mid.includes('sale_deed')) return <FileText className="w-5 h-5" />;
    if (mid.includes('invoice')) return <Receipt className="w-5 h-5" />;
    if (mid.includes('development')) return <Building2 className="w-5 h-5" />;
    if (mid.includes('tds')) return <ShieldCheck className="w-5 h-5" />;
    if (mid.includes('payment_advice')) return <CreditCard className="w-5 h-5" />;
    return <Sparkles className="w-5 h-5" />;
};

export function TemplateTray({ templates, onSelect, onPreview }: TemplateTrayProps) {
    return (
        <div
            style={{
                width: '100%',
                maxWidth: '100%',
                overflow: 'hidden',
                position: 'relative',
                margin: '16px 0',
            }}
        >
            {/* Header */}
            <div style={{ marginBottom: '16px' }}>
                <span
                    style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#FFF5F0',
                        color: '#FF7A30',
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '1.2px',
                        borderRadius: '99px',
                        marginBottom: '8px',
                    }}
                >
                    Library
                </span>
                <h2
                    style={{
                        fontSize: '20px',
                        fontWeight: 800,
                        color: '#0F172A',
                        letterSpacing: '-0.5px',
                        margin: 0,
                    }}
                >
                    Document Templates
                </h2>
            </div>

            {/* Grid layout — wraps to rows, never scrolls horizontally */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '14px',
                    width: '100%',
                }}
            >
                {templates.map((template, index) => (
                    <motion.div
                        key={template.template_id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                            duration: 0.5,
                            delay: index * 0.08,
                            ease: [0.16, 1, 0.3, 1],
                        }}
                        style={{
                            background: '#FFFFFF',
                            border: '1.5px solid #F1F5F9',
                            borderRadius: '20px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column' as const,
                            justifyContent: 'space-between',
                            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
                            cursor: 'pointer',
                            minHeight: '180px',
                        }}
                        className="group hover:-translate-y-1 hover:border-[#FFDCC9] hover:shadow-[0_12px_30px_rgba(255,122,48,0.08)]"
                    >
                        <div>
                            {/* Icon + View button row */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '16px',
                                }}
                            >
                                <div
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        background: '#FFF5F0',
                                        color: '#FF7A30',
                                        borderRadius: '11px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {getTemplateIcon(template.template_id)}
                                </div>

                                {/* View / Preview button */}
                                {onPreview && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onPreview(template);
                                        }}
                                        title="Preview template"
                                        style={{
                                            width: '34px',
                                            height: '34px',
                                            borderRadius: '10px',
                                            border: '1.5px solid #F1F5F9',
                                            background: 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            color: '#94A3B8',
                                            transition: 'all 0.25s ease',
                                        }}
                                        className="hover:!border-[#FF7A30] hover:!bg-[#FFF5F0] hover:!text-[#FF7A30]"
                                        onMouseDown={(e) => {
                                            const btn = e.currentTarget;
                                            btn.style.transform = 'scale(0.9)';
                                            setTimeout(() => { btn.style.transform = 'scale(1)'; }, 100);
                                        }}
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <h3
                                style={{
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    color: '#0F172A',
                                    margin: '0 0 6px 0',
                                    lineHeight: 1.3,
                                }}
                            >
                                {template.name}
                            </h3>
                            <p
                                style={{
                                    fontSize: '12px',
                                    lineHeight: 1.5,
                                    color: '#64748B',
                                    marginBottom: '16px',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical' as const,
                                    overflow: 'hidden',
                                    minHeight: '36px',
                                }}
                            >
                                {template.description || 'Quickly generate this document with AI assistance.'}
                            </p>
                        </div>

                        <button
                            onClick={() => onSelect(template)}
                            style={{
                                background: 'transparent',
                                border: '1.5px solid #F1F5F9',
                                color: '#0F172A',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                width: '100%',
                                transition: 'all 0.3s',
                            }}
                            className="group-hover:border-[#FF7A30] group-hover:text-[#FF7A30] hover:!bg-[#FF7A30] hover:!text-white hover:!border-[#FF7A30]"
                            onMouseDown={(e) => {
                                const btn = e.currentTarget;
                                btn.style.transform = 'scale(0.96)';
                                setTimeout(() => { btn.style.transform = 'scale(1)'; }, 100);
                            }}
                        >
                            <span>Use Template</span>
                            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
