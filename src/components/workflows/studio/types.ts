export type WorkflowNode = {
    id: string;
    type: string;
    label: string;
    icon: React.ReactNode;
    position: { x: number; y: number };
    color?: string;
    data?: Record<string, any>;
};

export type WorkflowEdge = {
    id: string;
    from: string;
    to: string;
    sourceHandle?: string;
};
