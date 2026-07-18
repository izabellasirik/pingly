import DailyTasks from "@/components/DailyTasks";
import UpcomingFollowUps from "@/components/UpcomingFollowUps";

export default function DashboardPage() {
  const today = new Date();
  const label = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Today</h1>
        <p className="text-slate-500">{label}</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Daily tasks
        </h2>
        <DailyTasks />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Upcoming follow-ups
        </h2>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <UpcomingFollowUps />
        </div>
      </section>
    </div>
  );
}
