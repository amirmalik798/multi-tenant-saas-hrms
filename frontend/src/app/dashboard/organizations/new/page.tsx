import { redirect } from "next/navigation";

/** Keep old bookmarks and links working while opening creation in context. */
export default function NewOrganizationPageRoute() {
  redirect("/dashboard/organizations?create=1");
}
