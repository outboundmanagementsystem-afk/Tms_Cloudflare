"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react"

type DialogType = "success" | "error" | "warning" | "info"

interface DialogOptions {
    title?: string
    message: string
    type?: DialogType
}

interface DialogContextType {
    showDialog: (options: DialogOptions) => void
    closeDialog: () => void
}

const DialogContext = createContext<DialogContextType | null>(null)

export function useDialog() {
    const context = useContext(DialogContext)
    if (!context) {
        throw new Error("useDialog must be used within a DialogProvider")
    }
    return context
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const [options, setOptions] = useState<DialogOptions | null>(null)

    const showDialog = useCallback((opts: DialogOptions) => {
        setOptions(opts)
        setIsOpen(true)
    }, [])

    const closeDialog = useCallback(() => {
        setIsOpen(false)
    }, [])

    const type = options?.type || "info"
    const title = options?.title || (
        type === "success" ? "Success" :
        type === "error" ? "Error" :
        type === "warning" ? "Warning" : "Information"
    )

    const renderIcon = () => {
        switch (type) {
            case "success":
                return <CheckCircle2 className="w-12 h-12 text-[#06a15c] animate-bounce" />
            case "error":
                return <XCircle className="w-12 h-12 text-[#ef4444] animate-pulse" />
            case "warning":
                return <AlertTriangle className="w-12 h-12 text-[#f59e0b] animate-pulse" />
            case "info":
            default:
                return <Info className="w-12 h-12 text-[#D4AF37] animate-pulse" />
        }
    }

    return (
        <DialogContext.Provider value={{ showDialog, closeDialog }}>
            {children}

            {isOpen && options && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300"
                    onClick={closeDialog}
                >
                    <div 
                        className="bg-[#031A0C] border border-[#D4AF37]/30 rounded-2xl shadow-[0_0_50px_rgba(212,175,55,0.15)] p-6 max-w-sm w-full mx-auto text-center transform scale-100 opacity-100 transition-all duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-center mb-4">
                            {renderIcon()}
                        </div>
                        
                        <h3 className="font-sans font-bold tracking-wide uppercase text-sm mb-2 text-[#D4AF37]">
                            {title}
                        </h3>
                        
                        <p className="font-sans text-xs text-gray-300 leading-relaxed mb-6 whitespace-pre-line">
                            {options.message}
                        </p>
                        
                        <button
                            onClick={closeDialog}
                            className="w-full py-2.5 px-4 rounded-lg font-sans font-medium text-xs tracking-wider uppercase text-white transition-all bg-[#06a15c] hover:bg-[#058e50] active:scale-[0.98] shadow-lg shadow-[#06a15c]/20"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    )
}
