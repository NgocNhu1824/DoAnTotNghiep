import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Check,
  X,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SetPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newPassword: string, confirmPassword: string) => Promise<void>;
}

const SetPasswordModal: React.FC<SetPasswordModalProps> = ({
  open,
  onOpenChange,
  onSubmit,
}) => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const validationRules = [
    { label: "8+ characters", met: newPassword.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(newPassword) },
    { label: "Lowercase", met: /[a-z]/.test(newPassword) },
    { label: "Number", met: /\d/.test(newPassword) },
    { label: "Special character", met: /[^A-Za-z\d]/.test(newPassword) },
  ];

  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isPasswordStrong = validationRules.every((rule) => rule.met);
  const canSubmit = isPasswordStrong && isMatch && !isSubmitting;

  // Calculate password strength percentage.
  const strengthScore = useMemo(() => {
    return (
      (validationRules.filter((r) => r.met).length / validationRules.length) *
      100
    );
  }, [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await onSubmit(newPassword, confirmPassword);
      toast.success("Password set successfully");
      setNewPassword("");
      setConfirmPassword("");
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border-none shadow-2xl">
        {/* Header Decor */}
        <div className="bg-primary/5 p-6 pb-0">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-bold">
            Set password
          </DialogTitle>
          <DialogDescription className="mt-2 text-slate-500">
            For account security, please create a new password for your next
            login.
          </DialogDescription>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-4">
            {/* 1. Enter new password */}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  className="pr-10 h-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Keep strength bar close to password input for instant feedback. */}
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-500",
                    strengthScore <= 40
                      ? "bg-red-500"
                      : strengthScore <= 80
                        ? "bg-yellow-500"
                        : "bg-emerald-500",
                  )}
                  style={{ width: `${strengthScore}%` }}
                />
              </div>
            </div>

            {/* 2. Confirm password, directly after password input. */}
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn(
                    "h-11",
                    confirmPassword &&
                      !isMatch &&
                      "border-red-400 focus-visible:ring-red-400",
                  )}
                />
                {isMatch && isPasswordStrong && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Check className="w-5 h-5 text-emerald-500 animate-in zoom-in" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 3. Rules as a checklist before submit. */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Security requirements
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {validationRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                      rule.met
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-slate-300 text-transparent",
                    )}
                  >
                    <Check size={10} strokeWidth={4} />
                  </div>
                  <span
                    className={cn(
                      "text-[12px] transition-colors",
                      rule.met
                        ? "text-slate-900 font-medium"
                        : "text-slate-400",
                    )}
                  >
                    {rule.label}
                  </span>
                </div>
              ))}
              {/* Add password match to the rules checklist. */}
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                    isMatch
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-slate-300 text-transparent",
                  )}
                >
                  <Check size={10} strokeWidth={4} />
                </div>
                <span
                  className={cn(
                    "text-[12px] transition-colors",
                    isMatch ? "text-slate-900 font-medium" : "text-slate-400",
                  )}
                >
                  Passwords match
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  <ShieldCheck size={18} /> Complete setup
                </span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetPasswordModal;
