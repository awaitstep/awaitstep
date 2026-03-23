import React from "react";

interface LoadingViewProps {
    LoadingPlaceholder: React.ComponentType;
    isLoading?: boolean;
}

export const LoadingView: React.FC<
    React.PropsWithChildren<LoadingViewProps>
> = ({ children, LoadingPlaceholder, isLoading }) => {
    return isLoading ? (
        <LoadingPlaceholder />
    ) : children;
};
