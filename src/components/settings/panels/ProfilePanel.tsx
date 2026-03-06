import { useState } from "react";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TIMEZONES = [
  { value: "auto", label: "Browser (auto-detect)" },
  { value: "Europe/Moscow", label: "Europe/Moscow (UTC+3)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New York (UTC-5)" },
  { value: "America/Los_Angeles", label: "America/Los Angeles (UTC-8)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
];

const LANGUAGES = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
];

export function ProfilePanel() {
  const user = useCurrentUser();
  const initials = user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const [name, setName] = useState(user.name);
  const [email] = useState(user.email);
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState(user.timezone || "auto");
  const [language, setLanguage] = useState(user.locale || "en");
  const [signature, setSignature] = useState("");
  const [bio, setBio] = useState("");

  const isDirty = name !== user.name || roleTitle || phone || signature || bio || timezone !== (user.timezone || "auto") || language !== (user.locale || "en");

  const handleSave = () => {
    toast({ title: "Profile saved", description: "Your changes have been saved." });
  };

  const handleDiscard = () => {
    setName(user.name);
    setRoleTitle("");
    setPhone("");
    setTimezone(user.timezone || "auto");
    setLanguage(user.locale || "en");
    setSignature("");
    setBio("");
  };

  return (
    <div className="space-y-sp-3">
      <SettingsSection title="Profile" description="Your personal information and public identity.">
        {/* Avatar */}
        <div className="flex flex-wrap items-center gap-sp-2">
          <div className="relative">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-h3 bg-accent text-accent-foreground">{initials}</AvatarFallback>
            </Avatar>
            <button className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-secondary border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div>
            <p className="text-body-sm font-medium text-foreground">{user.name}</p>
            <p className="text-caption text-muted-foreground">Upload a photo (coming soon)</p>
          </div>
        </div>

        {/* Fields */}
        <div className="grid gap-sp-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={email} disabled className="opacity-60" />
          </div>
          <div className="space-y-1.5">
            <Label>Role title</Label>
            <Input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="e.g. Project Manager" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 (___) ___-__-__" />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>About me</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A short bio..." rows={2} />
        </div>

        <div className="space-y-1.5">
          <Label>Signature block</Label>
          <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Used in documents and contracts" rows={3} />
        </div>
      </SettingsSection>

      {/* Actions */}
      <div className="flex flex-wrap gap-sp-2 pt-sp-1">
        <Button className="w-full sm:w-auto" onClick={handleSave} disabled={!isDirty}>Save changes</Button>
        {isDirty && (
          <Button variant="ghost" className="w-full sm:w-auto" onClick={handleDiscard}>Discard</Button>
        )}
      </div>
    </div>
  );
}
