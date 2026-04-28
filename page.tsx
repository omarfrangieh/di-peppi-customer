import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Loader2, PlusCircle, RefreshCw, Trash2, Package, ArrowUpDown, ShieldCheck } from "lucide-react";

export default function DiPeppiInventoryUI() {
  const [config, setConfig] = useState({
    projectId: "di-peppi",
    region: "us-central1",
    useEmulator: false,
    emulatorHost: "http://127.0.0.1:5001",
  });

  const [createForm, setCreateForm] = useState({
    orderId: "TEST_ORDER",
    productId: "TEST_PRODUCT",
    quantity: "2",
    unitPrice: "10",
    unitCostPrice: "6",
    itemDiscountPercent: "0",
    notes: "",
    sample: false,
    gift: false,
  });

  const [updateForm, setUpdateForm] = useState({
    orderItemId: "",
    productId: "TEST_PRODUCT",
    quantity: "5",
    unitPrice: "10",
    unitCostPrice: "6",
    itemDiscountPercent: "0",
    notes: "",
    sample: false,
    gift: false,
  });

  const [deleteForm, setDeleteForm] = useState({ orderItemId: "" });
  const [lastResult, setLastResult] = useState<{ type: string; action: string; payload: unknown } | null>(null);
  const [loadingAction, setLoadingAction] = useState("");

  const endpointBase = useMemo(() => {
    if (config.useEmulator) {
      return `${config.emulatorHost}/${config.projectId}/${config.region}`;
    }
    return `https://${config.region}-${config.projectId}.cloudfunctions.net`;
  }, [config]);

  const callFunction = async (name: string, payload: unknown) => {
    const response = await fetch(`${endpointBase}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: payload }),
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const message =
        parsed?.error?.message ||
        parsed?.raw ||
        `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return parsed;
  };

  const runCreate = async () => {
    setLoadingAction("create");
    try {
      const result = await callFunction("createOrderItemCallable", {
        orderId: createForm.orderId,
        productId: createForm.productId,
        quantity: Number(createForm.quantity),
        unitPrice: Number(createForm.unitPrice),
        unitCostPrice: Number(createForm.unitCostPrice),
        itemDiscountPercent: Number(createForm.itemDiscountPercent),
        notes: createForm.notes,
        sample: createForm.sample,
        gift: createForm.gift,
      });
      const orderItemId = result?.result?.orderItemId || result?.orderItemId || "";
      if (orderItemId) {
        setUpdateForm((s) => ({ ...s, orderItemId }));
        setDeleteForm({ orderItemId });
      }
      setLastResult({ type: "success", action: "Create", payload: result });
    } catch (error) {
      setLastResult({ type: "error", action: "Create", payload: (error as Error).message });
    } finally {
      setLoadingAction("");
    }
  };

  const runUpdate = async () => {
    setLoadingAction("update");
    try {
      const result = await callFunction("updateOrderItemCallable", {
        orderItemId: updateForm.orderItemId,
        productId: updateForm.productId,
        quantity: Number(updateForm.quantity),
        unitPrice: Number(updateForm.unitPrice),
        unitCostPrice: Number(updateForm.unitCostPrice),
        itemDiscountPercent: Number(updateForm.itemDiscountPercent),
        notes: updateForm.notes,
        sample: updateForm.sample,
        gift: updateForm.gift,
      });
      setLastResult({ type: "success", action: "Update", payload: result });
    } catch (error) {
      setLastResult({ type: "error", action: "Update", payload: (error as Error).message });
    } finally {
      setLoadingAction("");
    }
  };

  const runDelete = async () => {
    setLoadingAction("delete");
    try {
      const result = await callFunction("deleteOrderItemCallable", {
        orderItemId: deleteForm.orderItemId,
      });
      setLastResult({ type: "success", action: "Delete", payload: result });
    } catch (error) {
      setLastResult({ type: "error", action: "Delete", payload: (error as Error).message });
    } finally {
      setLoadingAction("");
    }
  };

  const setCfg = (key: string, value: unknown) => setConfig((s) => ({ ...s, [key]: value }));

  const statusBadge = lastResult?.type === "success" ? (
    <Badge className="rounded-full">Success</Badge>
  ) : lastResult?.type === "error" ? (
    <Badge variant="destructive" className="rounded-full">Error</Badge>
  ) : (
    <Badge variant="secondary" className="rounded-full">Idle</Badge>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"
        >
          <Card className="rounded-3xl shadow-sm border-0">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full">Di Peppi</Badge>
                    <Badge variant="outline" className="rounded-full">Callable Backend</Badge>
                  </div>
                  <CardTitle className="text-3xl font-semibold tracking-tight">
                    Inventory Control Panel
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-600">
                    Mobile-friendly admin UI for create, update, and delete order item actions using your Firebase callable endpoints.
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3">
                  <Package className="h-6 w-6" />
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="rounded-3xl shadow-sm border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-3">
                <span className="text-slate-600">Status</span>
                {statusBadge}
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3">
                <div className="text-slate-500">Endpoint base</div>
                <div className="mt-1 break-all font-medium">{endpointBase}</div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-3xl shadow-sm border-0">
            <CardHeader>
              <CardTitle className="text-xl">Environment Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Project ID</Label>
                  <Input
                    value={config.projectId}
                    onChange={(e) => setCfg("projectId", e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input
                    value={config.region}
                    onChange={(e) => setCfg("region", e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[140px_1fr] md:items-end">
                <div className="space-y-2">
                  <Label>Use Emulator</Label>
                  <Button
                    type="button"
                    variant={config.useEmulator ? "default" : "outline"}
                    className="w-full rounded-2xl"
                    onClick={() => setCfg("useEmulator", !config.useEmulator)}
                  >
                    {config.useEmulator ? "Enabled" : "Disabled"}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Emulator Base URL</Label>
                  <Input
                    value={config.emulatorHost}
                    onChange={(e) => setCfg("emulatorHost", e.target.value)}
                    className="rounded-2xl"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl shadow-sm border-0">
            <CardHeader>
              <CardTitle className="text-xl">Result Console</CardTitle>
            </CardHeader>
            <CardContent>
              {lastResult ? (
                <Alert className="rounded-2xl">
                  <AlertTitle>{lastResult.action} {lastResult.type === "success" ? "completed" : "failed"}</AlertTitle>
                  <AlertDescription>
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                      {typeof lastResult.payload === "string"
                        ? lastResult.payload
                        : JSON.stringify(lastResult.payload, null, 2)}
                    </pre>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="rounded-2xl border border-dashed p-8 text-sm text-slate-500">
                  Run any action and the response will appear here.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-3xl shadow-sm border-0">
          <CardContent className="p-4 md:p-6">
            <Tabs defaultValue="create" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl">
                <TabsTrigger value="create" className="rounded-2xl">Create</TabsTrigger>
                <TabsTrigger value="update" className="rounded-2xl">Update</TabsTrigger>
                <TabsTrigger value="delete" className="rounded-2xl">Delete</TabsTrigger>
              </TabsList>

              <TabsContent value="create">
                <div className="grid gap-6 lg:grid-cols-2">
                  <FormBlock
                    title="Create Order Item"
                    icon={<PlusCircle className="h-5 w-5" />}
                    description="Creates the order item, creates the stock movement, then recalculates stock."
                  >
                    <Field label="Order ID">
                      <Input value={createForm.orderId} onChange={(e) => setCreateForm({ ...createForm, orderId: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <Field label="Product ID">
                      <Input value={createForm.productId} onChange={(e) => setCreateForm({ ...createForm, productId: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <TwoCol>
                      <Field label="Quantity">
                        <Input type="number" value={createForm.quantity} onChange={(e) => setCreateForm({ ...createForm, quantity: e.target.value })} className="rounded-2xl" />
                      </Field>
                      <Field label="Unit Price">
                        <Input type="number" value={createForm.unitPrice} onChange={(e) => setCreateForm({ ...createForm, unitPrice: e.target.value })} className="rounded-2xl" />
                      </Field>
                    </TwoCol>
                    <TwoCol>
                      <Field label="Unit Cost Price">
                        <Input type="number" value={createForm.unitCostPrice} onChange={(e) => setCreateForm({ ...createForm, unitCostPrice: e.target.value })} className="rounded-2xl" />
                      </Field>
                      <Field label="Discount %">
                        <Input type="number" value={createForm.itemDiscountPercent} onChange={(e) => setCreateForm({ ...createForm, itemDiscountPercent: e.target.value })} className="rounded-2xl" />
                      </Field>
                    </TwoCol>
                    <Field label="Notes">
                      <Input value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <div className="flex gap-3">
                      <Button className="rounded-2xl" onClick={runCreate} disabled={loadingAction === "create"}>
                        {loadingAction === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}Create Order Item
                      </Button>
                    </div>
                  </FormBlock>

                  <QuickGuide
                    title="Create Notes"
                    items={[
                      "Uses createOrderItemCallable.",
                      "Checks product stock before writing.",
                      "On success, pushes the returned orderItemId into Update and Delete tabs.",
                    ]}
                  />
                </div>
              </TabsContent>

              <TabsContent value="update">
                <div className="grid gap-6 lg:grid-cols-2">
                  <FormBlock
                    title="Update Order Item"
                    icon={<ArrowUpDown className="h-5 w-5" />}
                    description="Reverses old quantity, applies new quantity, then recalculates stock."
                  >
                    <Field label="Order Item ID">
                      <Input value={updateForm.orderItemId} onChange={(e) => setUpdateForm({ ...updateForm, orderItemId: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <Field label="Product ID">
                      <Input value={updateForm.productId} onChange={(e) => setUpdateForm({ ...updateForm, productId: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <TwoCol>
                      <Field label="Quantity">
                        <Input type="number" value={updateForm.quantity} onChange={(e) => setUpdateForm({ ...updateForm, quantity: e.target.value })} className="rounded-2xl" />
                      </Field>
                      <Field label="Unit Price">
                        <Input type="number" value={updateForm.unitPrice} onChange={(e) => setUpdateForm({ ...updateForm, unitPrice: e.target.value })} className="rounded-2xl" />
                      </Field>
                    </TwoCol>
                    <TwoCol>
                      <Field label="Unit Cost Price">
                        <Input type="number" value={updateForm.unitCostPrice} onChange={(e) => setUpdateForm({ ...updateForm, unitCostPrice: e.target.value })} className="rounded-2xl" />
                      </Field>
                      <Field label="Discount %">
                        <Input type="number" value={updateForm.itemDiscountPercent} onChange={(e) => setUpdateForm({ ...updateForm, itemDiscountPercent: e.target.value })} className="rounded-2xl" />
                      </Field>
                    </TwoCol>
                    <Field label="Notes">
                      <Input value={updateForm.notes} onChange={(e) => setUpdateForm({ ...updateForm, notes: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <Button className="rounded-2xl" onClick={runUpdate} disabled={loadingAction === "update"}>
                      {loadingAction === "update" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Update Order Item
                    </Button>
                  </FormBlock>

                  <QuickGuide
                    title="Update Notes"
                    items={[
                      "Uses updateOrderItemCallable.",
                      "Writes a reverse In movement and an apply Out movement.",
                      "Supports same-product quantity changes and product swaps.",
                    ]}
                  />
                </div>
              </TabsContent>

              <TabsContent value="delete">
                <div className="grid gap-6 lg:grid-cols-2">
                  <FormBlock
                    title="Delete Order Item"
                    icon={<Trash2 className="h-5 w-5" />}
                    description="Deletes the order item and restores stock with a new In movement."
                  >
                    <Field label="Order Item ID">
                      <Input value={deleteForm.orderItemId} onChange={(e) => setDeleteForm({ orderItemId: e.target.value })} className="rounded-2xl" />
                    </Field>
                    <Button className="rounded-2xl" onClick={runDelete} disabled={loadingAction === "delete"}>
                      {loadingAction === "delete" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete Order Item
                    </Button>
                  </FormBlock>

                  <QuickGuide
                    title="Delete Notes"
                    items={[
                      "Uses deleteOrderItemCallable.",
                      "Removes the orderItems row.",
                      "Creates a restoring In movement for full traceability.",
                    ]}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Separator />

        <div className="text-xs text-slate-500">
          Tip: after a successful create, the returned orderItemId is auto-filled into the Update and Delete sections.
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function FormBlock({ title, icon, description, children }: { title: string; icon: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-slate-100 p-3">{icon}</div>
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function QuickGuide({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.map((item: string) => (
          <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

