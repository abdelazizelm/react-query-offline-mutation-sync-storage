import React, { useState } from "react";

import {
  useQuery,
  QueryClient,
  MutationCache,
  onlineManager,
  useIsRestoring,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import toast, { Toaster } from "react-hot-toast";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 2000,
      retry: 0,
    },
  },
  // configure global cache callbacks to show toast notifications
  mutationCache: new MutationCache({
    onSuccess: (data) => {
      console.log("success");
    },
    onError: (error) => {
      console.log("error");
    },
  }),
});

export default function App() {
  // we need a default mutation function so that paused mutations can resume after a page reload
  queryClient.setMutationDefaults(["client"], {
    mutationFn: async (newClient) => {
      // to avoid clashes with our optimistic update when an offline mutation continues
      await queryClient.cancelQueries(["clients"]);
      return PostClient(newClient);
    },
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
      onSuccess={() => {
        // resume mutations after initial restore from localStorage was successful
        queryClient.resumePausedMutations().then(() => {
          queryClient.invalidateQueries();
        });
      }}
    >
      <List />
      <ReactQueryDevtools initialIsOpen />
    </PersistQueryClientProvider>
  );
}

const FetchClients = async () => {
  const clients = await fetch("http://192.168.1.108:8000/clients");
  return await clients.json();
};

const PostClient = (newClient) => {
  let reqOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newClient),
  };

  fetch("http://192.168.1.108:8000/clients", reqOptions)
    .then((res) => res.json())
    .then((client) => {
      return client;
    })
    .catch((err) => {
      // console.log('fetch failed', err);
    });
};

function List() {
  const [firstName, SetFirstName] = React.useState();
  const [lastName, SetLastName] = React.useState();
  const [client, setClient] = React.useState();

  React.useEffect(() => {
    setClient({ firstName, lastName });
  }, [firstName, lastName]);

  const clientsQuery = useQuery(["clients"], FetchClients);

  function submitForm(event) {
    event.preventDefault();

    mutateClient.mutate(client);
    SetFirstName("");
    SetLastName("");
  }

  const mutateClient = useMutation({
    mutationKey: ["client"],
    onMutate: async () => {
      await queryClient.cancelQueries(["clients"]);
      const previousData = queryClient.getQueryData(["clients"]);

      // remove local state so that server state is taken instead
      setClient(undefined);

      queryClient.setQueryData(["clients"], {
        ...previousData,
        client: {
          ...previousData.clients,
          client,
        },
      });

      console.log(previousData);

      return { previousData };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["clients"], context.previousData);
    },
    onSettled: () => {
      queryClient.invalidateQueries(["clients"]);
    },
  });

  if (clientsQuery.isLoading && clientsQuery.isFetching) {
    return "Loading...";
  }

  if (clientsQuery.data) {
    return (
      <div>
        <h1>clients</h1>
        <p>
          Try to mock offline behaviour with the button in the devtools. You can
          navigate around as long as there is already data in the cache. You'll
          get a refetch as soon as you go online again.
        </p>
        <ul>
          {clientsQuery.data.clients.map((el) => (
            <li key={el._id}>{el.firstName}</li>
          ))}
        </ul>
        <div>{clientsQuery.isFetching && "fetching..."}</div>
        <form
          onSubmit={submitForm}
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
          }}
        >
          <label
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            First Name:
            <input
              style={{ width: "200px", padding: "10px" }}
              type="text"
              name="name"
              value={firstName}
              onChange={(event) => SetFirstName(event.target.value)}
            />
          </label>
          <label
            style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            Last Name:
            <input
              style={{ width: "200px", padding: "10px" }}
              type="text"
              name="name"
              value={lastName}
              onChange={(event) => SetLastName(event.target.value)}
            />
          </label>
          <div style={{ padding: "20px" }}>
            <input
              type="submit"
              value="Submit"
              style={{ width: "100px", padding: "10px" }}
            />
          </div>
        </form>
      </div>
    );
  }

  // query will be in 'idle' fetchStatus while restoring from localStorage
  return null;
}
