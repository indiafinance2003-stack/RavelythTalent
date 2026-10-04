import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui/primitives";
import { deleteBlogPostAction, saveBlogPostAction } from "@/lib/admin/blog-actions";
import { db } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Blog management" };

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

function BlogPostForm({ post }: { post?: typeof blogPosts.$inferSelect }) {
  return (
    <form action={saveBlogPostAction} className="grid gap-3 md:grid-cols-2">
      {post ? <input name="id" type="hidden" value={post.id} /> : <input name="id" type="hidden" value="" />}
      <label className="text-sm font-medium text-navy">
        Title
        <input className={fieldClass} defaultValue={post?.title} maxLength={180} minLength={3} name="title" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Slug
        <input className={fieldClass} defaultValue={post?.slug} maxLength={200} minLength={3} name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
      </label>
      <label className="text-sm font-medium text-navy">
        Category
        <input className={fieldClass} defaultValue={post?.category ?? ""} maxLength={100} name="category" />
      </label>
      <label className="text-sm font-medium text-navy">
        Author display name
        <input className={fieldClass} defaultValue={post?.authorName ?? ""} maxLength={120} name="authorName" />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Excerpt
        <textarea className={fieldClass} defaultValue={post?.excerpt ?? ""} maxLength={500} name="excerpt" rows={2} />
      </label>
      <label className="text-sm font-medium text-navy md:col-span-2">
        Article content
        <textarea className={fieldClass} defaultValue={post?.content ?? ""} maxLength={50000} minLength={20} name="content" required rows={12} />
        <span className="mt-1 block text-xs font-normal text-slate-500">Plain text with paragraph breaks; HTML is not accepted.</span>
      </label>
      <label className="text-sm font-medium text-navy">
        Cover image (JPEG, PNG, WebP; max 4 MB)
        <input className={fieldClass} accept="image/jpeg,image/png,image/webp" name="cover" type="file" />
        {post?.coverImagePath ? <span className="mt-1 block text-xs text-slate-500">A cover image is currently attached.</span> : null}
      </label>
      {post?.coverImagePath ? (
        <label className="flex items-center gap-2 self-center text-sm font-medium text-navy">
          <input name="removeCover" type="checkbox" />
          Remove current cover image
        </label>
      ) : <input name="removeCover" type="hidden" value="" />}
      <label className="text-sm font-medium text-navy">
        SEO title
        <input className={fieldClass} defaultValue={post?.metaTitle ?? ""} maxLength={180} name="metaTitle" />
      </label>
      <label className="text-sm font-medium text-navy">
        SEO description
        <input className={fieldClass} defaultValue={post?.metaDescription ?? ""} maxLength={320} name="metaDescription" />
      </label>
      <label className="text-sm font-medium text-navy">
        Publication status
        <select className={`${fieldClass} bg-white`} defaultValue={post?.status ?? "draft"} name="status">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button className="rounded-lg bg-royal px-4 py-2 text-sm font-semibold text-white hover:bg-navy" type="submit">
          {post ? "Save post" : "Create post"}
        </button>
        {post?.status === "published" ? (
          <Link className="text-sm font-semibold text-royal hover:underline" href={`/blog/${post.slug}`} target="_blank">
            View published post
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default async function AdminBlogPage() {
  const posts = await db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt));

  return (
    <div className="space-y-6">
      <PageHeader title="Blog posts" description="Create drafts, publish career advice, and manage SEO metadata." />
      <Card>
        <h2 className="mb-4 font-bold text-navy">New post</h2>
        <BlogPostForm />
      </Card>
      {posts.map((post) => (
        <Card key={post.id}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-navy">{post.title}</h2>
              <p className="text-sm text-slate-600">/{post.slug} · {post.status}</p>
            </div>
            <form action={deleteBlogPostAction}>
              <input name="id" type="hidden" value={post.id} />
              <button className="text-sm font-semibold text-red-700 hover:underline" type="submit">Delete</button>
            </form>
          </div>
          <BlogPostForm post={post} />
        </Card>
      ))}
    </div>
  );
}
