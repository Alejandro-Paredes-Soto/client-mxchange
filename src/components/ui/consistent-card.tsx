import React from "react";
import { motion } from "motion/react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { animations, hoverConfig } from "@/lib/animations";
import { styleUtils } from "@/lib/styles";

interface ConsistentCardProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    onClick?: () => void;
    href?: string;
}

export function ConsistentCard({
    title,
    description,
    icon,
    children,
    className,
    onClick,
    href
}: ConsistentCardProps) {
    const { cardVariants } = animations;
    
    const CardWrapper = href ? 'a' : 'div';
    const cardProps = href ? { href, target: "_blank", rel: "noopener noreferrer" } : {};

    return (
        <motion.div
            variants={cardVariants}
            whileHover={hoverConfig}
            className="h-full"
        >
            <CardWrapper {...cardProps}>
                <Card className={cn(
                    styleUtils.card(),
                    onClick && "cursor-pointer",
                    className
                )}>
                    <CardContent className="p-6 sm:p-8 h-full">
                        {icon && (
                            <div className="bg-primary/10 mb-4 p-4 rounded-2xl w-fit">
                                <div className="text-primary">
                                    {icon}
                                </div>
                            </div>
                        )}
                        
                        <h3 className={styleUtils.title('card')}>
                            {title}
                        </h3>
                        
                        <p className={styleUtils.description('card')}>
                            {description}
                        </p>
                        
                        {children && (
                            <div className="mt-6">
                                {children}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </CardWrapper>
        </motion.div>
    );
} 