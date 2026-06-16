import { Home, LogOut, Plus, Search, Trophy, User } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

const links = [
  { to: "/", label: "Home", icon: Home },
  { to: "/create", label: "Create Room", icon: Plus },
  { to: "/join", label: "Join Room", icon: Search },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/leaderboards", label: "Leaderboards", icon: Trophy }
];

export function AppShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen text-zinc-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-void/86 px-4 py-5 backdrop-blur lg:block">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.32em] text-neon">Chess</p>
          <h1 className="text-2xl font-black">Impostor</h1>
        </div>
        <nav className="space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                  isActive ? "bg-neon text-white shadow-glow" : "text-zinc-300 hover:bg-white/8 hover:text-white"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          className="absolute bottom-5 left-4 right-4 flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/8"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          <LogOut size={18} />
          Log out
        </button>
      </aside>
      <main className="min-h-screen lg:pl-64 pb-20 lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-void/76 px-4 py-3 backdrop-blur lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">Online</p>
            <p className="font-semibold">{user?.username}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-neon/20 text-sm font-bold text-neon">
              {user?.username.slice(0, 2).toUpperCase()}
            </div>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              title="Log out"
              className="lg:hidden rounded-md border border-white/10 p-2 text-zinc-400 hover:bg-white/8 hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <div className="px-4 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Bottom navigation bar for mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-white/10 bg-void/90 py-2 backdrop-blur lg:hidden">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-1 text-[10px] transition ${
                isActive ? "text-neon font-semibold" : "text-zinc-400 hover:text-zinc-200"
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
