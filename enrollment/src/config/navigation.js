export const navigationItems = [
  {
    label: "Dashboard",
    shortLabel: "Dashboard",
    path: "/",
    icon: "fa-solid fa-gauge-high",
    description: "Enrollment overview",
  },
  {
    label: "Student Directory",
    shortLabel: "Students",
    path: "/students",
    icon: "fa-solid fa-user-graduate",
    description: "Student records",
  },
  {
    label: "Curriculum",
    shortLabel: "Curriculum",
    path: "/curriculum",
    icon: "fa-solid fa-book-open",
    description: "Program subjects",
  },
  {
    label: "Section Management",
    shortLabel: "Sections",
    path: "/section",
    icon: "fa-solid fa-users-between-lines",
    description: "Class capacity",
  },
  {
    label: "Schedules",
    shortLabel: "Schedules",
    path: "/schedules",
    icon: "fa-solid fa-calendar-days",
    description: "Section schedules",
  },
];

export function getNavigationItem(pathname) {
  return navigationItems.find((item) => item.path === pathname) ?? navigationItems[0];
}
