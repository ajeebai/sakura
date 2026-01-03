import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { deleteDB } from 'idb';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    window.location.reload();
  };

  private handleHardReset = async () => {
    if (confirm("This will delete your library settings and tracking data. Your actual files will NOT be deleted. Continue?")) {
        try {
            await deleteDB('sakura-db');
            window.location.reload();
        } catch (e) {
            alert("Failed to delete database. Please clear site data manually.");
        }
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-900 flex items-center justify-center p-6 text-stone-200 font-sans">
            <div className="max-w-md w-full bg-stone-800 rounded-2xl p-8 border border-stone-700 shadow-2xl">
                <div className="flex items-center justify-center w-16 h-16 bg-red-900/20 rounded-full mb-6 mx-auto">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-2xl font-serif text-center mb-2 text-stone-100">Something went wrong</h1>
                <p className="text-stone-400 text-center mb-6 text-sm">
                    Sakura encountered an unexpected error.
                </p>
                
                <div className="bg-black/30 p-4 rounded-lg mb-8 font-mono text-xs text-red-300 overflow-auto max-h-32">
                    {this.state.error?.message || "Unknown error"}
                </div>

                <div className="space-y-3">
                    <button 
                        onClick={this.handleReset}
                        className="w-full flex items-center justify-center py-3 bg-stone-100 text-stone-900 rounded-lg font-bold hover:bg-white transition-colors"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reload App
                    </button>
                    
                    <button 
                        onClick={this.handleHardReset}
                        className="w-full flex items-center justify-center py-3 border border-stone-600 text-stone-400 rounded-lg hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/50 transition-colors text-sm"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Reset Database
                    </button>
                </div>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}
