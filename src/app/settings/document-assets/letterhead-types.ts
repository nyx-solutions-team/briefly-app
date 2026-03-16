export type LetterheadBuilderForm = {
    brand_name: string;
    tagline: string;
    accent_color: string;
    text_color: string;
    email: string;
    phone: string;
    website: string;
    address_line: string;
    city_line: string;
    registration_line: string;
    monogram: string;
    logo_data_url: string;
    logo_alignment: "left" | "right";
    logo_scale: "small" | "medium" | "large";
    theme: "modern" | "minimal" | "professional" | "elegant" | "bold" | "clean" | "classic" | "creative" | "tech" | "organic";
};
