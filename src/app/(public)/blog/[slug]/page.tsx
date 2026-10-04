import type { Metadata } from "next";
import Image from "next/image";
import { and, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/primitives";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getSiteSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

async function findPublishedPost(slug: string) {
  const rows = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const [{ slug }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.featureBlog) return { title: "Article unavailable" };
  const post = await findPublishedPost(slug);
  if (!post) return { title: "Article not found" };
  return {
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt || undefined,
    openGraph: {
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt || undefined,
      type: "article",
      publishedTime: post.publishedAt?.toISOString(),
      images: post.coverImagePath
        ? [{ url: `/api/files/blog/${encodeURIComponent(post.slug)}` }]
        : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const [{ slug }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.featureBlog) notFound();
  const post = await findPublishedPost(slug);
  if (!post) notFound();
  await db
    .update(blogPosts)
    .set({ viewsCount: sql`${blogPosts.viewsCount} + 1` })
    .where(eq(blogPosts.id, post.id));

  return (
    <article className="mx-auto max-w-4xl space-y-7 px-4 py-10 sm:px-6">
      {post.category ? <Badge tone="teal">{post.category}</Badge> : null}
      <header>
        <h1 className="text-3xl font-extrabold leading-tight text-navy sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-sm text-slate-600">
          {[post.authorName, post.publishedAt?.toLocaleDateString("en-IN")].filter(Boolean).join(" · ")}
        </p>
      </header>
      {post.coverImagePath ? (
        <Image
          alt=""
          className="max-h-[480px] w-full rounded-2xl object-cover"
          height={900}
          priority
          src={`/api/files/blog/${encodeURIComponent(post.slug)}`}
          width={1600}
        />
      ) : null}
      {post.excerpt ? <p className="text-lg font-medium leading-8 text-slate-700">{post.excerpt}</p> : null}
      <Card>
        <div className="whitespace-pre-wrap break-words text-base leading-8 text-slate-700">{post.content}</div>
      </Card>
    </article>
  );
}
