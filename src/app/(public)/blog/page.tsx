import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Career advice and stories",
  description: "Career advice, job search guidance, and hiring insights from Ravelyth Talent.",
};

export default async function BlogIndexPage() {
  const settings = await getSiteSettings();
  if (!settings.featureBlog) notFound();
  const posts = await db
    .select({
      title: blogPosts.title,
      slug: blogPosts.slug,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      authorName: blogPosts.authorName,
      coverImagePath: blogPosts.coverImagePath,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-10 sm:px-6">
      <PageHeader title="Career advice & insights" description="Practical guidance for candidates and hiring teams." />
      {posts.length === 0 ? (
        <EmptyState title="No articles published yet" description="New career advice will appear here when available." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Card key={post.slug} className="overflow-hidden p-0">
              {post.coverImagePath ? (
                <Image
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                  height={675}
                  src={`/api/files/blog/${encodeURIComponent(post.slug)}`}
                  width={1200}
                />
              ) : null}
              <div className="p-6">
                {post.category ? <Badge tone="teal">{post.category}</Badge> : null}
                <h2 className="mt-3 text-lg font-bold text-navy">
                  <Link className="hover:text-royal" href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                {post.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{post.excerpt}</p> : null}
                <p className="mt-4 text-xs text-slate-500">
                  {[post.authorName, post.publishedAt?.toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
